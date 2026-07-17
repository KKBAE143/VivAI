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
    sentiment_analyzer,
    weakness_heatmap,
)
from core.config import get_settings
from core.database import get_supabase
from core.deps import get_current_user
from models.schemas import (
    CodeAwareSessionCreate,
    SentimentSessionCreate,
)
from services.activity_service import log_activity

router = APIRouter(prefix="/api/advanced", tags=["advanced"])


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
        raise HTTPException(status_code=400, detail="Upload a ZIP file")
    data = await file.read()
    files = code_aware_viva.extract_source_files(data)
    if not files:
        raise HTTPException(status_code=400, detail="No readable source files found in the ZIP")
    sb = get_supabase()
    path = f"{user['id']}/code/{uuid.uuid4().hex}-{file.filename}"
    try:
        sb.storage.from_(get_settings().storage_bucket).upload(path, data, {"content-type": "application/zip"})
    except Exception:
        path = None
    snapshot = sb.table("code_snapshots").insert(
        {
            "profile_id": user["id"],
            "project_id": project_id or None,
            "name": file.filename or "code.zip",
            "source_type": "zip",
            "storage_path": path,
            "file_count": len(files),
        }
    ).execute().data[0]
    return {**snapshot, "files_detected": list(files.keys())}


@router.get("/code-aware/snapshots")
def code_snapshots(user=Depends(get_current_user)):
    return (
        get_supabase().table("code_snapshots").select("*")
        .eq("profile_id", user["id"]).order("created_at", desc=True).execute().data
    )


def _load_snapshot_files(snapshot: dict) -> dict[str, str]:
    if snapshot.get("source_type") == "zip" and snapshot.get("storage_path"):
        try:
            data = get_supabase().storage.from_(get_settings().storage_bucket).download(snapshot["storage_path"])
            return code_aware_viva.extract_source_files(data)
        except Exception:
            return {}
    return {}


@router.post("/code-aware/prepare-viva", status_code=201)
async def code_prepare_viva(
    file: UploadFile = File(...),
    project_id: str | None = Form(default=None),
    structure_json: str | None = Form(default=None),
    language: str = Form(default="English"),
    persona: str = Form(default="balanced"),
    duration_minutes: int = Form(default=10),
    user=Depends(get_current_user),
):
    """Upload ZIP, distill knowledge pack, create live-ready CodeAware session.

    Live context is the rendered pack only (not full source). Free-tier safe.
    """
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty ZIP upload")
    files = code_aware_viva.extract_source_files(data)
    if not files:
        raise HTTPException(status_code=400, detail="No readable source files found in the ZIP")

    structure = None
    if structure_json:
        try:
            structure = json.loads(structure_json)
        except (ValueError, TypeError):
            structure = None

    # Distill semantic pack (1 Gemini call max inside; deterministic fallback).
    pack = code_aware_viva.build_knowledge_pack(files, structure if isinstance(structure, dict) else None)
    live_brief = code_aware_viva.render_pack_for_live(pack)
    if len(live_brief) > code_aware_viva.LIVE_BRIEF_MAX_CHARS + 50:
        live_brief = live_brief[: code_aware_viva.LIVE_BRIEF_MAX_CHARS]

    sb = get_supabase()
    storage_path = f"{user['id']}/code/{uuid.uuid4().hex}-{file.filename or 'code.zip'}"
    try:
        sb.storage.from_(get_settings().storage_bucket).upload(
            storage_path, data, {"content-type": "application/zip"}
        )
    except Exception:
        storage_path = None

    analysis_summary = {
        "knowledge_pack": pack,
        "live_brief": live_brief,
        "structure": structure,
        "file_list": list(files.keys())[:200],
        "pack_source": pack.get("source"),
        "brief_chars": len(live_brief),
    }

    snapshot = sb.table("code_snapshots").insert(
        {
            "profile_id": user["id"],
            "project_id": project_id or None,
            "name": file.filename or "code.zip",
            "source_type": "zip",
            "storage_path": storage_path,
            "file_count": len(files),
            "analyzed": True,
            "analysis_summary": analysis_summary,
        }
    ).execute().data[0]

    practice = code_aware_viva.practice_questions_from_pack(pack)
    focus = code_aware_viva.focus_topics_from_pack(pack)
    duration = max(5, min(20, int(duration_minutes or 10)))

    session = sb.table("viva_sessions").insert(
        {
            "profile_id": user["id"],
            "project_id": project_id or None,
            "session_type": "CodeAware",
            "subject": f"Code-aware viva: {snapshot['name']}",
            "duration_minutes": duration,
            "language": language or "English",
            "persona": persona or "balanced",
            "difficulty": "Medium",
            "status": "Pending",
            "context": {
                "snapshot_id": snapshot["id"],
                "code_aware": True,
                "live_brief": live_brief,
                "knowledge_pack": pack,
                "practice_questions": practice,
                "focus_topics": focus,
                "brief_chars": len(live_brief),
            },
        }
    ).execute().data[0]

    log_activity(
        user["id"],
        "code_viva_prepared",
        f"Prepared code-aware viva ({len(files)} files, brief {len(live_brief)} chars)",
        project_id,
        "viva_session",
        session["id"],
    )
    return {
        "session": session,
        "snapshot": snapshot,
        "pack_source": pack.get("source"),
        "brief_chars": len(live_brief),
        "viva_plan_count": len(practice),
        "file_count": len(files),
    }


@router.post("/code-aware/session", status_code=201)
def code_session(body: CodeAwareSessionCreate, user=Depends(get_current_user)):
    """Create a session from an existing analyzed snapshot (legacy / secondary path)."""
    sb = get_supabase()
    res = sb.table("code_snapshots").select("*").eq("id", body.snapshot_id).eq("profile_id", user["id"]).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    snapshot = res.data[0]
    summary = snapshot.get("analysis_summary") or {}
    if isinstance(summary, str):
        try:
            summary = json.loads(summary)
        except (ValueError, TypeError):
            summary = {}
    pack = summary.get("knowledge_pack") if isinstance(summary, dict) else None
    if not pack:
        files = _load_snapshot_files(snapshot)
        if not files:
            raise HTTPException(status_code=400, detail="Snapshot has no files to analyze — re-upload ZIP")
        pack = code_aware_viva.build_knowledge_pack(files, summary.get("structure") if isinstance(summary, dict) else None)
    live_brief = summary.get("live_brief") if isinstance(summary, dict) else None
    if not live_brief:
        live_brief = code_aware_viva.render_pack_for_live(pack)
    practice = code_aware_viva.practice_questions_from_pack(pack)
    focus = code_aware_viva.focus_topics_from_pack(pack)
    session = sb.table("viva_sessions").insert(
        {
            "profile_id": user["id"],
            "project_id": body.project_id,
            "session_type": "CodeAware",
            "subject": f"Code-aware viva: {snapshot['name']}",
            "duration_minutes": body.duration_minutes,
            "language": body.language,
            "persona": body.persona,
            "difficulty": "Medium",
            "status": "Pending",
            "context": {
                "snapshot_id": body.snapshot_id,
                "code_aware": True,
                "live_brief": live_brief,
                "knowledge_pack": pack,
                "practice_questions": practice,
                "focus_topics": focus,
            },
        }
    ).execute().data[0]
    return session


def _presentation(presentation_id: str, user_id: str) -> dict:
    """Load a presentation_sessions row owned by the user (used by sentiment routes)."""
    res = (
        get_supabase().table("presentation_sessions").select("*")
        .eq("id", presentation_id).eq("profile_id", user_id).execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Presentation session not found")
    return res.data[0]


# Team Viva Mode (REST + WebSocket) now lives in api/team_live.py — a live,
# voice, AI-hosted group session replacing the old text race-to-answer mode.

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
