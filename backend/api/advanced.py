"""All 7 advanced feature endpoints."""
import json
import uuid
from datetime import datetime, timezone

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)

from ai import (
    code_aware_viva,
    college_predictor,
    faculty_sim,
    gemini_service,
    prompts,
    sentiment_analyzer,
    viva_core,
    weakness_heatmap,
)
from ai.team_viva import manager as team_manager
from core.config import get_settings
from core.database import get_supabase
from core.deps import get_current_user
from models.schemas import (
    AnswerSubmit,
    CodeAwareSessionCreate,
    FacultyProfileCreate,
    FacultySimEnd,
    FacultySimSessionCreate,
    GithubLinkRequest,
    SentimentSessionCreate,
    TeamVivaCreate,
)
from services.activity_service import log_activity

router = APIRouter(prefix="/api/advanced", tags=["advanced"])


def _viva_session(session_id: str, user_id: str) -> dict:
    res = get_supabase().table("viva_sessions").select("*").eq("id", session_id).eq("profile_id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found")
    return res.data[0]


def _session_questions(session_id: str) -> list[dict]:
    return (
        get_supabase().table("viva_questions").select("*")
        .eq("session_id", session_id).order("question_number").execute().data
    )


# =====================================================
# A. Code-Aware Viva
# =====================================================
@router.post("/code-aware/upload", status_code=201)
async def code_upload(
    file: UploadFile | None = File(default=None),
    project_id: str | None = Form(default=None),
    user=Depends(get_current_user),
):
    if file is None:
        raise HTTPException(status_code=400, detail="Upload a ZIP file (or use the github link endpoint)")
    data = await file.read()
    files = code_aware_viva.extract_source_files(data)
    if not files:
        raise HTTPException(status_code=400, detail="No readable source files found in the ZIP")
    sb = get_supabase()
    path = f"{user['id']}/code/{uuid.uuid4().hex}-{file.filename}"
    try:
        sb.storage.from_(get_settings().storage_bucket).upload(path, data, {"content-type": "application/zip"})
    except Exception:
        path = None  # snapshot still usable via re-upload; keep metadata
    snapshot = sb.table("code_snapshots").insert(
        {
            "profile_id": user["id"],
            "project_id": project_id,
            "name": file.filename or "code.zip",
            "source_type": "zip",
            "storage_path": path,
            "file_count": len(files),
        }
    ).execute().data[0]
    return {**snapshot, "files_detected": list(files.keys())}


@router.post("/code-aware/link-github", status_code=201)
def code_link_github(body: GithubLinkRequest, user=Depends(get_current_user)):
    snapshot = get_supabase().table("code_snapshots").insert(
        {
            "profile_id": user["id"],
            "project_id": body.project_id,
            "name": body.name or body.github_url.rstrip("/").split("/")[-1],
            "source_type": "github",
            "github_url": body.github_url,
        }
    ).execute().data[0]
    return snapshot


@router.get("/code-aware/snapshots")
def code_snapshots(user=Depends(get_current_user)):
    return (
        get_supabase().table("code_snapshots").select("*")
        .eq("profile_id", user["id"]).order("created_at", desc=True).execute().data
    )


def _load_snapshot_files(snapshot: dict) -> dict[str, str]:
    if snapshot["source_type"] == "zip" and snapshot.get("storage_path"):
        try:
            data = get_supabase().storage.from_(get_settings().storage_bucket).download(snapshot["storage_path"])
            return code_aware_viva.extract_source_files(data)
        except Exception:
            return {}
    return {}


@router.post("/code-aware/analyze")
def code_analyze(snapshot_id: str, user=Depends(get_current_user)):
    sb = get_supabase()
    res = sb.table("code_snapshots").select("*").eq("id", snapshot_id).eq("profile_id", user["id"]).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    snapshot = res.data[0]
    files = _load_snapshot_files(snapshot)
    if not files:
        raise HTTPException(status_code=400, detail="Could not load source files (GitHub-only snapshots need a ZIP upload for analysis)")
    analysis = code_aware_viva.analyze_codebase(files)
    sb.table("code_snapshots").update({"analyzed": True, "analysis_summary": analysis}).eq("id", snapshot_id).execute()
    return analysis


@router.post("/code-aware/session", status_code=201)
def code_session(body: CodeAwareSessionCreate, user=Depends(get_current_user)):
    sb = get_supabase()
    res = sb.table("code_snapshots").select("*").eq("id", body.snapshot_id).eq("profile_id", user["id"]).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    session = sb.table("viva_sessions").insert(
        {
            "profile_id": user["id"],
            "project_id": body.project_id,
            "session_type": "CodeAware",
            "subject": f"Code review: {res.data[0]['name']}",
            "duration_minutes": body.duration_minutes,
            "language": body.language,
            "context": {"snapshot_id": body.snapshot_id},
        }
    ).execute().data[0]
    return session


def _code_session_assets(session: dict, user_id: str):
    snapshot_id = (session.get("context") or {}).get("snapshot_id")
    res = get_supabase().table("code_snapshots").select("*").eq("id", snapshot_id).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Snapshot missing for this session")
    snapshot = res.data[0]
    files = _load_snapshot_files(snapshot)
    analysis = snapshot.get("analysis_summary") or code_aware_viva.analyze_codebase(files)
    return snapshot, files, analysis


def _ask_code_question(session: dict, files: dict, analysis: dict) -> dict:
    questions = _session_questions(session["id"])
    covered = [q["topic"] for q in questions if q.get("topic")]
    covered += [json.loads(q["hint_text"]).get("file") for q in questions if False]  # files tracked via topic
    generated = code_aware_viva.generate_code_question(analysis, files, covered, session["language"])
    row = get_supabase().table("viva_questions").insert(
        {
            "session_id": session["id"],
            "question_number": len(questions) + 1,
            "question_text": generated["question"],
            "expected_answer": generated.get("expected_answer"),
            "topic": generated.get("file") or generated.get("topic"),
        }
    ).execute().data[0]
    return {"question_id": row["id"], "question_number": row["question_number"], "question": row["question_text"], "file": generated.get("file"), "code_excerpt": files.get(generated.get("file") or "", "")[:2000]}


@router.post("/code-aware/{session_id}/start")
def code_start(session_id: str, user=Depends(get_current_user)):
    session = _viva_session(session_id, user["id"])
    _, files, analysis = _code_session_assets(session, user["id"])
    get_supabase().table("viva_sessions").update({"status": "In Progress"}).eq("id", session_id).execute()
    return _ask_code_question(session, files, analysis)


@router.post("/code-aware/{session_id}/answer")
def code_answer(session_id: str, body: AnswerSubmit, user=Depends(get_current_user)):
    sb = get_supabase()
    session = _viva_session(session_id, user["id"])
    questions = _session_questions(session_id)
    pending = [q for q in questions if q["answer_text"] is None]
    if not pending:
        raise HTTPException(status_code=400, detail="No open question")
    question = pending[-1]
    evaluation = viva_core.evaluate_answer(
        question["question_text"], question.get("expected_answer"), body.answer, session["language"]
    )
    sb.table("viva_questions").update(
        {"answer_text": body.answer, "score": evaluation["score"], "feedback": evaluation.get("feedback")}
    ).eq("id", question["id"]).execute()
    _, files, analysis = _code_session_assets(session, user["id"])
    return {"evaluation": evaluation, "next_question": _ask_code_question(session, files, analysis)}


@router.post("/code-aware/{session_id}/end")
def code_end(session_id: str, user=Depends(get_current_user)):
    session = _viva_session(session_id, user["id"])
    questions = [q for q in _session_questions(session_id) if q.get("score") is not None]
    summary = viva_core.session_summary(questions)
    covered_files = sorted({q["topic"] for q in questions if q.get("topic")})
    get_supabase().table("viva_sessions").update(
        {"status": "Completed", "score": summary["overall_score"], "completed_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", session_id).execute()
    log_activity(user["id"], "code_viva_completed", f"Code-aware viva completed ({summary['overall_score']}%)", session.get("project_id"))
    return {**summary, "code_coverage": covered_files}


# =====================================================
# B. Presentation -> Viva Bridge
# =====================================================
GAP_THRESHOLD = 70


def _presentation(presentation_id: str, user_id: str) -> dict:
    res = (
        get_supabase().table("presentation_sessions").select("*")
        .eq("id", presentation_id).eq("profile_id", user_id).execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Presentation session not found")
    return res.data[0]


@router.get("/bridge/{presentation_id}/gaps")
def bridge_gaps(presentation_id: str, user=Depends(get_current_user)):
    presentation = _presentation(presentation_id, user["id"])
    state = presentation.get("topic_scores") or {}
    if isinstance(state, str):
        state = json.loads(state)
    topics = state.get("topics", {})
    gaps = [
        {
            "topic": topic,
            "clarity_score": score,
            "gap_severity": "high" if score < 50 else "medium" if score < 60 else "low",
        }
        for topic, score in topics.items()
        if isinstance(score, (int, float)) and score < GAP_THRESHOLD
    ]
    return sorted(gaps, key=lambda g: g["clarity_score"])


@router.post("/bridge/{presentation_id}/generate-questions")
def bridge_generate(presentation_id: str, user=Depends(get_current_user)):
    presentation = _presentation(presentation_id, user["id"])
    gaps = bridge_gaps(presentation_id, user)
    if not gaps:
        return {"message": "No weak topics detected — great presentation!", "gaps": []}
    project_context = ""
    if presentation.get("project_id"):
        res = get_supabase().table("projects").select("*").eq("id", presentation["project_id"]).execute()
        project_context = viva_core.build_project_context(res.data[0] if res.data else None)
    questions = gemini_service.generate_json(
        prompts.BRIDGE_QUESTIONS.format(gaps=[g["topic"] for g in gaps], project_context=project_context),
        prompts.VIVA_EXAMINER,
        default={},
    )
    sb = get_supabase()
    stored = []
    for gap in gaps:
        row = sb.table("bridge_gaps").insert(
            {
                "presentation_id": presentation_id,
                "profile_id": user["id"],
                "topic": gap["topic"],
                "clarity_score": gap["clarity_score"],
                "gap_severity": gap["gap_severity"],
                "questions": questions.get(gap["topic"], []),
            }
        ).execute().data[0]
        stored.append(row)
    return {"gaps": stored}


@router.post("/bridge/{presentation_id}/launch-viva", status_code=201)
def bridge_launch(presentation_id: str, user=Depends(get_current_user)):
    presentation = _presentation(presentation_id, user["id"])
    sb = get_supabase()
    gap_rows = sb.table("bridge_gaps").select("*").eq("presentation_id", presentation_id).execute().data
    if not gap_rows:
        raise HTTPException(status_code=400, detail="Generate questions first")
    topics = [g["topic"] for g in gap_rows]
    session = sb.table("viva_sessions").insert(
        {
            "profile_id": user["id"],
            "project_id": presentation.get("project_id"),
            "session_type": "Subject",
            "subject": f"Focused practice: {', '.join(topics[:3])}",
            "duration_minutes": 15,
            "difficulty": "Medium",
            "context": {"bridge_presentation_id": presentation_id, "focus_topics": topics},
        }
    ).execute().data[0]
    number = 0
    for gap in gap_rows:
        for q in gap.get("questions") or []:
            number += 1
            sb.table("viva_questions").insert(
                {
                    "session_id": session["id"],
                    "question_number": number,
                    "question_text": q.get("question", ""),
                    "expected_answer": q.get("expected_answer"),
                    "topic": gap["topic"],
                }
            ).execute()
        sb.table("bridge_gaps").update({"viva_session_id": session["id"]}).eq("id", gap["id"]).execute()
    sb.table("viva_sessions").update({"total_questions": number, "status": "In Progress"}).eq("id", session["id"]).execute()
    return {**session, "total_questions": number}


@router.get("/bridge/history")
def bridge_history(user=Depends(get_current_user)):
    return (
        get_supabase().table("bridge_gaps").select("*")
        .eq("profile_id", user["id"]).order("created_at", desc=True).execute().data
    )


# =====================================================
# C. Team Viva Mode (REST + WebSocket)
# =====================================================
@router.post("/team-viva/sessions", status_code=201)
def team_viva_create(body: TeamVivaCreate, user=Depends(get_current_user)):
    sb = get_supabase()
    member = (
        sb.table("team_members").select("*").eq("team_id", body.team_id).eq("profile_id", user["id"]).execute().data
    )
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this team")
    session = sb.table("viva_sessions").insert(
        {
            "profile_id": user["id"],
            "project_id": body.project_id,
            "session_type": "TeamViva",
            "subject": body.subject,
            "duration_minutes": 20,
            "context": {"team_id": body.team_id},
        }
    ).execute().data[0]
    return session


@router.get("/team-viva/sessions/{session_id}")
def team_viva_get(session_id: str, user=Depends(get_current_user)):
    res = get_supabase().table("viva_sessions").select("*").eq("id", session_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found")
    room = team_manager.rooms.get(session_id)
    return {**res.data[0], "online_members": list(room.connections.keys()) if room else [], "scoreboard": team_manager.scoreboard(room) if room else []}


@router.post("/team-viva/{session_id}/end")
def team_viva_end(session_id: str, user=Depends(get_current_user)):
    sb = get_supabase()
    res = sb.table("viva_sessions").select("*").eq("id", session_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found")
    session = res.data[0]
    room = team_manager.rooms.get(session_id)
    scoreboard = team_manager.scoreboard(room) if room else []
    team_id = (session.get("context") or {}).get("team_id")
    if scoreboard:
        team_avg = round(sum(s["score_total"] for s in scoreboard) / len(scoreboard))
        for entry in scoreboard:
            sb.table("team_viva_scores").insert(
                {
                    "session_id": session_id,
                    "team_id": team_id,
                    "profile_id": entry["profile_id"],
                    "individual_score": min(entry["score_total"], 100) if entry["questions_answered"] == 0 else min(round(entry["score_total"] / max(entry["questions_answered"], 1)), 100),
                    "questions_answered": entry["questions_answered"],
                    "first_answers": entry["first_answers"],
                    "corrections_given": entry["corrections_given"],
                    "team_score": min(team_avg, 100),
                }
            ).execute()
    sb.table("viva_sessions").update(
        {"status": "Completed", "completed_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", session_id).execute()
    return {"scoreboard": scoreboard}


@router.get("/team-viva/{session_id}/report")
def team_viva_report(session_id: str, user=Depends(get_current_user)):
    scores = (
        get_supabase().table("team_viva_scores").select("*, profiles(full_name)")
        .eq("session_id", session_id).execute().data
    )
    return {"session_id": session_id, "members": scores}


# =====================================================
# D. Faculty Simulation
# =====================================================
@router.post("/faculty-sim/profiles", status_code=201)
def faculty_create(body: FacultyProfileCreate, user=Depends(get_current_user)):
    college = body.college_name or (user.get("profile") or {}).get("college_name")
    if not college:
        raise HTTPException(status_code=400, detail="Set your college in your profile first")
    res = get_supabase().table("faculty_profiles").upsert(
        {
            "college_name": college,
            "name": body.name,
            "subjects": body.subjects,
            "style_tags": body.style_tags,
            "known_patterns": body.known_patterns,
            "difficulty_level": body.difficulty_level,
        },
        on_conflict="college_name,name",
    ).execute()
    return res.data[0]


@router.get("/faculty-sim/profiles")
def faculty_list(search: str | None = None, user=Depends(get_current_user)):
    college = (user.get("profile") or {}).get("college_name")
    q = get_supabase().table("faculty_profiles").select("*")
    if college:
        q = q.eq("college_name", college)
    if search:
        q = q.ilike("name", f"%{search}%")
    return q.order("avg_rating", desc=True).execute().data


@router.get("/faculty-sim/profiles/{profile_id}")
def faculty_get(profile_id: str, user=Depends(get_current_user)):
    res = get_supabase().table("faculty_profiles").select("*").eq("id", profile_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Faculty profile not found")
    return res.data[0]


@router.post("/faculty-sim/{faculty_id}/session", status_code=201)
def faculty_session(faculty_id: str, body: FacultySimSessionCreate, user=Depends(get_current_user)):
    faculty = faculty_get(faculty_id, user)
    session = get_supabase().table("viva_sessions").insert(
        {
            "profile_id": user["id"],
            "project_id": body.project_id,
            "session_type": "FacultySim",
            "subject": body.subject or (faculty["subjects"][0] if faculty["subjects"] else None),
            "duration_minutes": body.duration_minutes,
            "difficulty": faculty.get("difficulty_level") or "Medium",
            "language": body.language,
            "context": {"faculty_id": faculty_id},
        }
    ).execute().data[0]
    return session


def _faculty_persona(session: dict, user: dict) -> str:
    faculty_id = (session.get("context") or {}).get("faculty_id")
    faculty = faculty_get(faculty_id, user)
    return faculty_sim.build_persona_prompt(faculty)


@router.post("/faculty-sim/sessions/{session_id}/start")
def faculty_start(session_id: str, user=Depends(get_current_user)):
    session = _viva_session(session_id, user["id"])
    persona = _faculty_persona(session, user)
    get_supabase().table("viva_sessions").update({"status": "In Progress"}).eq("id", session_id).execute()
    generated = viva_core.generate_question(
        session.get("subject"), "", session["difficulty"], session["language"], [], persona
    )
    row = get_supabase().table("viva_questions").insert(
        {"session_id": session_id, "question_number": 1, "question_text": generated["question"], "expected_answer": generated.get("expected_answer"), "topic": generated.get("topic")}
    ).execute().data[0]
    return {"question_id": row["id"], "question_number": 1, "question": row["question_text"]}


@router.post("/faculty-sim/sessions/{session_id}/answer")
def faculty_answer(session_id: str, body: AnswerSubmit, user=Depends(get_current_user)):
    sb = get_supabase()
    session = _viva_session(session_id, user["id"])
    persona = _faculty_persona(session, user)
    questions = _session_questions(session_id)
    pending = [q for q in questions if q["answer_text"] is None]
    if not pending:
        raise HTTPException(status_code=400, detail="No open question")
    question = pending[-1]
    evaluation = viva_core.evaluate_answer(
        question["question_text"], question.get("expected_answer"), body.answer, session["language"], persona
    )
    sb.table("viva_questions").update(
        {"answer_text": body.answer, "score": evaluation["score"], "feedback": evaluation.get("feedback")}
    ).eq("id", question["id"]).execute()
    generated = viva_core.generate_question(
        session.get("subject"), "", session["difficulty"], session["language"],
        [q["question_text"] for q in questions], persona,
    )
    row = sb.table("viva_questions").insert(
        {"session_id": session_id, "question_number": len(questions) + 1, "question_text": generated["question"], "expected_answer": generated.get("expected_answer"), "topic": generated.get("topic")}
    ).execute().data[0]
    return {"evaluation": evaluation, "next_question": {"question_id": row["id"], "question": row["question_text"], "question_number": row["question_number"]}}


@router.post("/faculty-sim/sessions/{session_id}/end")
def faculty_end(session_id: str, body: FacultySimEnd, user=Depends(get_current_user)):
    sb = get_supabase()
    session = _viva_session(session_id, user["id"])
    questions = [q for q in _session_questions(session_id) if q.get("score") is not None]
    summary = viva_core.session_summary(questions)
    sb.table("viva_sessions").update(
        {"status": "Completed", "score": summary["overall_score"], "completed_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", session_id).execute()
    faculty_id = (session.get("context") or {}).get("faculty_id")
    if body.accuracy_rating and faculty_id:
        sb.table("faculty_sim_ratings").insert(
            {"session_id": session_id, "faculty_id": faculty_id, "profile_id": user["id"], "accuracy_rating": body.accuracy_rating, "feedback": body.feedback}
        ).execute()
        ratings = sb.table("faculty_sim_ratings").select("accuracy_rating").eq("faculty_id", faculty_id).execute().data
        avg = sum(r["accuracy_rating"] for r in ratings) / len(ratings)
        sb.table("faculty_profiles").update({"avg_rating": round(avg, 2), "total_ratings": len(ratings)}).eq("id", faculty_id).execute()
    return summary


@router.get("/faculty-sim/my-sessions")
def faculty_my_sessions(user=Depends(get_current_user)):
    return (
        get_supabase().table("viva_sessions").select("*")
        .eq("profile_id", user["id"]).eq("session_type", "FacultySim")
        .order("created_at", desc=True).execute().data
    )


# =====================================================
# E. Viva Weakness Heatmap
# =====================================================
@router.get("/heatmap/overall")
def heatmap_overall(user=Depends(get_current_user)):
    return weakness_heatmap.compute_heatmap(user["id"])


@router.get("/heatmap/{project_id}")
def heatmap_project(project_id: str, user=Depends(get_current_user)):
    return weakness_heatmap.compute_heatmap(user["id"], project_id)


@router.get("/heatmap/{project_id}/detailed/{topic}")
def heatmap_detail(project_id: str, topic: str, user=Depends(get_current_user)):
    pid = None if project_id in ("overall", "all") else project_id
    return weakness_heatmap.topic_history(user["id"], pid, topic)


@router.post("/heatmap/refresh")
def heatmap_refresh(user=Depends(get_current_user)):
    heatmap = weakness_heatmap.compute_heatmap(user["id"])
    weakness_heatmap.persist_heatmap(user["id"], None, heatmap)
    return {"refreshed": len(heatmap), "heatmap": heatmap}


# =====================================================
# F. College Viva Predictor
# =====================================================
def _college(user: dict) -> str:
    college = (user.get("profile") or {}).get("college_name")
    if not college:
        raise HTTPException(status_code=400, detail="Set your college in your profile to use the predictor")
    return college


@router.get("/predictor/topics/{subject}")
def predictor_topics(subject: str, user=Depends(get_current_user)):
    return college_predictor.predicted_topics(_college(user), subject)


@router.get("/predictor/trends")
def predictor_trends(days: int = 30, user=Depends(get_current_user)):
    return college_predictor.trending_topics(_college(user), days)


@router.get("/predictor/recent-questions/{subject}")
def predictor_recent(subject: str, user=Depends(get_current_user)):
    return college_predictor.recent_questions(_college(user), subject)


@router.get("/predictor/my-risk")
def predictor_risk(user=Depends(get_current_user)):
    college = _college(user)
    my_weak = {h["topic"]: h for h in weakness_heatmap.compute_heatmap(user["id"]) if h["avg_score"] < 70}
    trends = college_predictor.trending_topics(college, 30)
    risks = [
        {
            "topic": t["topic"],
            "college_frequency": t["recent_count"],
            "my_avg_score": my_weak[t["topic"]]["avg_score"],
            "risk": "high" if my_weak[t["topic"]]["avg_score"] < 50 else "medium",
        }
        for t in trends
        if t["topic"] in my_weak
    ]
    return sorted(risks, key=lambda r: r["my_avg_score"])


# =====================================================
# G. Real-Time Presentation Sentiment
# =====================================================
@router.post("/sentiment/session", status_code=201)
def sentiment_session(body: SentimentSessionCreate, user=Depends(get_current_user)):
    res = get_supabase().table("presentation_sessions").insert(
        {
            "profile_id": user["id"],
            "project_id": body.project_id,
            "session_type": "Sentiment",
            "duration_minutes": body.duration_minutes,
            "status": "In Progress",
            "topic_scores": {"samples": [], "nudges": []},
        }
    ).execute()
    return res.data[0]


@router.post("/sentiment/{session_id}/end")
def sentiment_end(session_id: str, user=Depends(get_current_user)):
    session = _presentation(session_id, user["id"])
    state = session.get("topic_scores") or {}
    if isinstance(state, str):
        state = json.loads(state)
    samples = state.get("samples", [])
    avg = lambda key: round(sum(s.get(key, 0) for s in samples) / len(samples)) if samples else None
    updates = {
        "status": "Completed",
        "confidence_score": avg("confidence"),
        "clarity_score": avg("eye_contact"),
        "coverage_score": avg("energy"),
        "overall_score": avg("confidence"),
        "feedback_summary": f"{len(samples)} frames analyzed, {len(state.get('nudges', []))} live nudges given.",
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }
    get_supabase().table("presentation_sessions").update(updates).eq("id", session_id).execute()
    return {**updates, "nudge_history": state.get("nudges", [])}


@router.get("/sentiment/{session_id}/report")
def sentiment_report(session_id: str, user=Depends(get_current_user)):
    session = _presentation(session_id, user["id"])
    state = session.get("topic_scores") or {}
    if isinstance(state, str):
        state = json.loads(state)
    return {
        "session": {k: session[k] for k in ("id", "status", "confidence_score", "overall_score", "feedback_summary")},
        "metrics_over_time": state.get("samples", []),
        "nudges": state.get("nudges", []),
    }


# =====================================================
# WebSockets (registered on the same router)
# =====================================================
@router.websocket("/ws/team-viva/{session_id}/{profile_id}")
async def ws_team_viva(websocket: WebSocket, session_id: str, profile_id: str):
    sb = get_supabase()
    res = sb.table("viva_sessions").select("*").eq("id", session_id).eq("session_type", "TeamViva").execute()
    if not res.data:
        await websocket.close(code=4404)
        return
    session = res.data[0]
    prof = sb.table("profiles").select("full_name").eq("id", profile_id).execute().data
    name = prof[0]["full_name"] if prof else "Member"
    room = team_manager.room(session_id)
    await team_manager.connect(session_id, profile_id, name, websocket)
    project_context = ""
    if session.get("project_id"):
        p = sb.table("projects").select("*").eq("id", session["project_id"]).execute().data
        project_context = viva_core.build_project_context(p[0] if p else None)
    try:
        while True:
            message = await websocket.receive_json()
            msg_type = message.get("type")
            if msg_type in ("start", "next"):
                await team_manager.next_question(room, session.get("subject"), project_context, session.get("language", "English"))
            elif msg_type == "answer":
                await team_manager.handle_answer(room, profile_id, message.get("text", ""), session.get("language", "English"))
    except WebSocketDisconnect:
        team_manager.disconnect(session_id, profile_id)


@router.websocket("/ws/sentiment/{session_id}")
async def ws_sentiment(websocket: WebSocket, session_id: str):
    import base64

    sb = get_supabase()
    res = sb.table("presentation_sessions").select("*").eq("id", session_id).execute()
    if not res.data:
        await websocket.close(code=4404)
        return
    await websocket.accept()
    history: list[dict] = []
    nudge_log: list[dict] = []
    frame_count = 0
    ANALYZE_EVERY = 3  # throttle for Gemini free-tier rate limits
    try:
        while True:
            message = await websocket.receive_json()
            if message.get("type") != "frame":
                continue
            frame_count += 1
            if frame_count % ANALYZE_EVERY != 1:
                continue
            try:
                image = base64.b64decode(message["data"].split(",")[-1])
            except Exception:
                continue
            metrics = sentiment_analyzer.analyze_frame(image, message.get("mime_type", "image/jpeg"))
            nudges = sentiment_analyzer.generate_nudges(metrics, history)
            history.append(metrics)
            for nudge in nudges:
                nudge_log.append({"at_frame": frame_count, "message": nudge})
            await websocket.send_json({"type": "metrics", "metrics": metrics, "nudges": nudges})
            if len(history) % 5 == 0:
                sb.table("presentation_sessions").update(
                    {"topic_scores": {"samples": history, "nudges": nudge_log}}
                ).eq("id", session_id).execute()
    except WebSocketDisconnect:
        sb.table("presentation_sessions").update(
            {"topic_scores": {"samples": history, "nudges": nudge_log}}
        ).eq("id", session_id).execute()
