"""Real-time Live AI WebSocket proxy: browser <-> FastAPI <-> Gemini Live.

Route: WS /ws/live/{mode}/{session_id}?token=...&language=..&persona=..&project_id=..

Protocol
--------
Browser -> server:
  - binary frame           = raw PCM16 mono 16kHz mic audio chunk
  - {"type":"image","data":<base64 jpeg>}  = one screen/camera frame (~1fps)
  - {"type":"text","text":...}             = typed message (accessibility fallback)
  - {"type":"end"}                          = student ended the session

server -> browser:
  - binary frame           = raw PCM 24kHz AI speech audio
  - {"type":"ready"}
  - {"type":"user_transcript","text":...}
  - {"type":"ai_transcript","text":...}
  - {"type":"interrupted"}                   (AI was barged-in on)
  - {"type":"turn_complete"}
  - {"type":"event","event":"flag|question|score", ...}
  - {"type":"ended","summary":{...}}
  - {"type":"error","message":...}
"""
from __future__ import annotations

import asyncio
import base64
import json
import time
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from google.genai import types

from ai import delivery_metrics, live_service, report_service, viva_core
from ai.registry import find_scenario_by_label, get_scenario
from core.database import get_supabase
from core.deps import user_from_token
from core.logging import get_logger
from services import gamification_service
from services.activity_service import log_activity

router = APIRouter(tags=["live"])
logger = get_logger("live")

# Safety release for the server-side mic gate: if the model never emits
# a turn_complete (e.g. greeting failed), stop dropping mic audio after this long
# so the session can never deadlock waiting for a greeting that isn't coming.
_MIC_GATE_SAFETY_SECONDS = 20

# One Live Gemini session + one greeting trigger per app session_id.
# Root cause of double greetings: two browser WebSockets (Strict Mode remount /
# concurrent start()) each connected and each called send_client_content(greeting).
_active_live_owners: dict[str, str] = {}
_active_live_lock = asyncio.Lock()


async def _release_live_owner(session_id: str, connection_id: str) -> None:
    async with _active_live_lock:
        if _active_live_owners.get(session_id) == connection_id:
            _active_live_owners.pop(session_id, None)


async def _forward_turn_complete(websocket: WebSocket, first_turn_done: asyncio.Event) -> None:
    """Notify the client before opening the server-side first-turn mic gate."""
    await websocket.send_json({"type": "turn_complete"})
    first_turn_done.set()


_response_audio_chunks = live_service.response_audio_chunks


def coalesce_turns(transcript: list[dict]) -> list[dict]:
    """Merge streaming transcript fragments into evidence-addressable turns."""
    turns: list[dict] = []
    for item in transcript:
        text = str(item.get("text") or "").strip()
        if not text:
            continue
        role = item.get("role")
        start = int(item.get("ts_ms", 0) or 0)
        if turns and turns[-1]["role"] == role:
            turns[-1]["text"] = f"{turns[-1]['text']} {text}".strip()
            turns[-1]["end_ms"] = start
        else:
            turns.append({"role": role, "text": text, "start_ms": start, "end_ms": start})
    return turns


_VIVA_SCENARIO_BY_TYPE = {
    "Subject": "subject_viva",
    "Project": "viva_defense",
    "General": "general_viva",
    "CodeAware": "viva_defense",
}


def resolve_viva_scenario_id(session_type: str | None) -> str:
    """Subject/Project/General/CodeAware vivas are different exams — own coaching
    emphasis, not just a shared "project defense" label. Pure so it's
    testable without a live session."""
    return _VIVA_SCENARIO_BY_TYPE.get(session_type or "", "viva_defense")


# --------------------------------------------------------------------------- #
# Context loading
# --------------------------------------------------------------------------- #
def _project_context(project_id: str | None) -> str:
    if not project_id:
        return ""
    res = get_supabase().table("projects").select("*").eq("id", project_id).execute()
    return viva_core.build_project_context(res.data[0] if res.data else None)


# --------------------------------------------------------------------------- #
# Persistence — turns live speech + tool calls into the app's existing records
# --------------------------------------------------------------------------- #
class LivePersistence:
    """Collects transcript, flags, questions and scores during a live session."""

    def __init__(
        self,
        mode: str,
        session_id: str,
        user_id: str,
        project_id: str | None,
        project_context: str = "",
        subject: str | None = None,
        scenario_id: str | None = None,
        video_source: str | None = None,
        persona: str = "balanced",
    ):
        self.mode = mode
        self.session_id = session_id
        self.user_id = user_id
        self.project_id = project_id
        self.project_context = project_context
        self.subject = subject
        self.scenario_id = scenario_id
        self.video_source = video_source
        self.persona = persona
        self.frames_received = 0
        self.started_at = time.monotonic()
        self.transcript: list[dict] = []
        self.flags: list[dict] = []
        self.observations: list[dict] = []
        self._event_buffer: list[dict] = []
        self.questions: list[dict] = []  # {question, topic, answer, score, feedback}

    def now_ms(self) -> int:
        return max(0, round((time.monotonic() - self.started_at) * 1000))

    def _buffer_event(self, kind: str, payload: dict, ts_ms: int | None = None) -> None:
        self._event_buffer.append({"ts_ms": self.now_ms() if ts_ms is None else ts_ms, "kind": kind, "payload": payload})

    def flush_events(self) -> None:
        if not self._event_buffer:
            return
        rows = [{"session_id": self.session_id, "mode": self.mode, "profile_id": self.user_id, **event} for event in self._event_buffer]
        try:
            get_supabase().table("session_events").insert(rows).execute()
            self._event_buffer.clear()
        except Exception as exc:
            print(f"[live] event flush failed: {exc}")

    # -- live signals ------------------------------------------------------- #
    def on_user_text(self, text: str) -> None:
        item = {"role": "student", "text": text, "ts_ms": self.now_ms()}
        self.transcript.append(item)
        self._buffer_event("transcript_turn", item, item["ts_ms"])
        # Attach the student's words as the answer to the latest open question.
        for q in reversed(self.questions):
            if q.get("score") is None and not q.get("answer"):
                q["answer"] = text
                break

    def on_ai_text(self, text: str) -> None:
        item = {"role": "examiner", "text": text, "ts_ms": self.now_ms()}
        self.transcript.append(item)
        self._buffer_event("transcript_turn", item, item["ts_ms"])

    @staticmethod
    def _evidence_is_near_duplicate(a: str, b: str) -> bool:
        return live_service.is_near_duplicate(a, b)

    def on_tool(self, name: str, args: dict) -> dict | None:
        """Handle a model tool call; return a client event to forward (or None)."""
        if name == "log_observation":
            dimension = str(args.get("dimension") or "").strip()
            kind = str(args.get("kind") or "note")
            evidence = str(args.get("evidence") or "")
            now = self.now_ms()
            if not dimension or not evidence:
                return None
            if any(
                item.get("dimension") == dimension and item.get("kind") == kind
                and now - int(item.get("ts_ms", 0)) < 20_000
                and self._evidence_is_near_duplicate(str(item.get("evidence") or ""), evidence)
                for item in self.observations
            ):
                return None
            item = {
                "id": f"obs_{len(self.observations) + 1}", "ts_ms": now,
                "category": args.get("category", "communication"), "dimension": dimension,
                "kind": kind if kind in {"strength", "issue", "note"} else "note",
                "severity": args.get("severity", "low"), "confidence": args.get("confidence", "low"),
                "evidence": evidence, "tip": args.get("tip"),
            }
            self.observations.append(item)
            self._buffer_event("observation", item, now)
            return {"type": "event", "event": "observation", **item, "text": item["evidence"]}
        if name == "flag_moment":
            item = {
                "kind": args.get("kind", "note"),
                "text": args.get("text", ""),
                "severity": args.get("severity", "low"),
            }
            self.flags.append(item)
            self._buffer_event("observation", item)
            return {"type": "event", "event": "flag", **item}
        if name == "record_question":
            now = self.now_ms()
            item = {
                "id": f"q_{len(self.questions) + 1}",
                "question": args.get("question", ""),
                "topic": args.get("topic"),
                "answer": None,
                "score": None,
                "feedback": None,
                "ts_ms": now,
            }
            self.questions.append(item)
            self._buffer_event("question", item, now)
            return {"type": "event", "event": "question", "id": item["id"], "question": item["question"], "topic": item["topic"]}
        if name == "score_response":
            score = max(0, min(100, int(args.get("score", 0) or 0)))
            feedback = args.get("feedback")
            topic = args.get("topic")
            now = self.now_ms()
            # Prefer an explicit question_id from the model when it supplies
            # one; otherwise fall back to the most recently asked, unscored
            # question — the only reliable signal available without it.
            question_id = args.get("question_id")
            target = None
            if question_id:
                target = next((q for q in self.questions if q.get("id") == question_id), None)
            if target is None:
                target = next((q for q in reversed(self.questions) if q.get("score") is None), None)
            if target is None:
                target = {"id": f"q_{len(self.questions) + 1}", "question": "(live discussion)", "topic": topic, "answer": None, "ts_ms": now}
                self.questions.append(target)
            target["score"] = score
            target["feedback"] = feedback
            if topic and not target.get("topic"):
                target["topic"] = topic
            self._buffer_event("score", target, now)
            return {"type": "event", "event": "score", "id": target.get("id"), "score": score, "feedback": feedback, "topic": target.get("topic")}
        return None

    # -- finalize ----------------------------------------------------------- #
    @property
    def has_activity(self) -> bool:
        """True only once the STUDENT actually spoke — an AI-only monologue
        (e.g. the student's mic never worked) must not become a graded report."""
        return any(t.get("role") == "student" and t.get("text") for t in self.transcript)

    def revert_status(self) -> None:
        """Put the session back to Pending so the student can retry (no fake 0% report)."""
        sb = get_supabase()
        try:
            if self.mode == "viva":
                sb.table("viva_sessions").update({"status": "Pending"}).eq("id", self.session_id).execute()
            elif self.mode in ("presentation", "coach", "pitch"):
                sb.table("presentation_sessions").update({"status": "Pending"}).eq("id", self.session_id).execute()
        except Exception as exc:
            print(f"[live] revert error ({self.mode}): {exc}")

    def _avg_score(self) -> int:
        scored = [q["score"] for q in self.questions if q.get("score") is not None]
        return round(sum(scored) / len(scored)) if scored else 0

    def finalize(self) -> dict:
        """Persist to the same tables the report pages read. Runs in a worker thread.

        The report is built primarily from a post-session analysis of the full
        transcript (reliable), falling back to any questions the live model
        logged via tools during the conversation.
        """
        sb = get_supabase()

        turns = coalesce_turns(self.transcript)
        metrics = delivery_metrics.from_transcript(turns)
        availability = {
            "audio": bool(turns),
            "camera": self.video_source == "camera" and self.frames_received > 0,
            "screen": self.video_source == "screen" and self.frames_received > 0,
            "transcript_quality": "ok" if len(turns) >= 3 else "sparse",
        }
        scenario = get_scenario(self.scenario_id) or get_scenario({
            "viva": "viva_defense", "presentation": "project_presentation", "pitch": "elevator_pitch", "coach": "hr_interview",
        }.get(self.mode, "viva_defense"))

        analysis = {}
        try:
            analysis = live_service.analyze_transcript(
                self.mode, turns, self.project_context, self.subject
            )
        except Exception as exc:
            print(f"[live] transcript analysis failed: {exc}")

        analyzed_q = analysis.get("questions") if isinstance(analysis, dict) else None
        if analyzed_q:
            self.questions = analyzed_q  # prefer the graded transcript Q&A
        overall = analysis.get("overall_score") if isinstance(analysis, dict) else None
        if not overall:
            overall = self._avg_score()
        overall = max(0, min(100, int(overall or 0)))
        summary_text = (analysis.get("summary") if isinstance(analysis, dict) else "") or (
            f"Live {self.mode} completed with {len(self.questions)} questions."
        )
        summary = {
            "overall_score": overall,
            "questions": self.questions,
            "flags": self.flags,
            "transcript": turns,
            "summary": summary_text,
            "strengths": analysis.get("strengths", []) if isinstance(analysis, dict) else [],
            "weaknesses": analysis.get("weaknesses", []) if isinstance(analysis, dict) else [],
        }
        if isinstance(analysis, dict) and self.mode == "coach":
            # Delivery-focused fields for the communication coach report.
            summary["coach_metrics"] = analysis.get("coach_metrics", {})
            summary["recommendations"] = analysis.get("recommendations", [])
        try:
            report = report_service.build_report(
                mode=self.mode, scenario=scenario, persona=self.persona, turns=turns,
                observations=self.observations, questions=self.questions, metrics=metrics,
                availability=availability, duration_ms=self.now_ms(), project_context=self.project_context,
            )
        except Exception as exc:
            print(f"[live] report build failed: {exc}")
            report = None
        self.flush_events()
        try:
            if self.mode == "viva":
                for i, q in enumerate(self.questions, start=1):
                    sb.table("viva_questions").insert({
                        "session_id": self.session_id,
                        "question_number": i,
                        "question_text": q.get("question") or "(live discussion)",
                        "topic": q.get("topic"),
                        "answer_text": q.get("answer"),
                        "score": q.get("score"),
                        "feedback": q.get("feedback"),
                    }).execute()
                sb.table("viva_sessions").update({
                    "status": "Completed",
                    "score": overall,
                    "answered_questions": len([q for q in self.questions if q.get("score") is not None]),
                    "total_questions": len(self.questions),
                    "context": {
                        "summary": summary_text,
                        "strengths": summary.get("strengths", []),
                        "weaknesses": summary.get("weaknesses", []),
                        "transcript": turns,
                    },
                    **({"report": report} if report else {}),
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                }).eq("id", self.session_id).execute()
                log_activity(self.user_id, "viva_completed", f"Completed live viva ({overall}%)",
                             self.project_id, "viva_session", self.session_id)
                gamification_service.award_xp(self.user_id, "viva_completed")

            elif self.mode == "presentation":
                row = sb.table("presentation_sessions").select("topic_scores").eq("id", self.session_id).execute()
                state = (row.data[0].get("topic_scores") if row.data else None) or {}
                if isinstance(state, str):
                    try:
                        state = json.loads(state)
                    except (ValueError, TypeError):
                        state = {}
                state.setdefault("slides", [])
                # Build a per-topic score map from Q&A for reports / heatmaps.
                topics: dict[str, int] = dict(state.get("topics") or {})
                for q in self.questions:
                    topic = (q.get("topic") or "").strip()
                    score = q.get("score")
                    if not topic or not isinstance(score, (int, float)):
                        continue
                    score_i = max(0, min(100, int(score)))
                    prev = topics.get(topic)
                    topics[topic] = score_i if prev is None else min(int(prev), score_i)
                state["topics"] = topics
                state["qa"] = [
                    {
                        "kind": "exam_q",
                        "question": q.get("question"),
                        "answer": q.get("answer"),
                        "topic": q.get("topic"),
                        "score": q.get("score"),
                        "feedback": q.get("feedback"),
                        "answered": q.get("score") is not None,
                    }
                    for q in self.questions
                ]
                weaknesses = summary.get("weaknesses") or []
                # Prefer short resource topics from the structured report when present.
                resource_topics = []
                if isinstance(report, dict):
                    for item in report.get("resources") or []:
                        if isinstance(item, dict) and item.get("topic"):
                            resource_topics.append(str(item["topic"]))
                    if not weaknesses:
                        weaknesses = [str(w) for w in (report.get("weaknesses") or []) if str(w).strip()]
                gap_labels = resource_topics or weaknesses or [
                    t for t, s in topics.items() if isinstance(s, (int, float)) and s < 70
                ]
                state["report"] = {
                    "flags": self.flags,
                    "transcript": turns,
                    "gaps": gap_labels[:6],
                    "weaknesses": weaknesses[:5],
                }
                # Dimension scores → aggregate columns when the structured report has them.
                clarity = confidence = coverage = overall
                if isinstance(report, dict):
                    dims = {
                        d.get("id"): d.get("score")
                        for d in ((report.get("scores") or {}).get("dimensions") or [])
                        if isinstance(d, dict)
                    }
                    if dims.get("clarity") is not None:
                        clarity = int(dims["clarity"])
                    if dims.get("delivery") is not None:
                        confidence = int(dims["delivery"])
                    if dims.get("structure") is not None:
                        coverage = int(dims["structure"])
                sb.table("presentation_sessions").update({
                    "status": "Completed",
                    "clarity_score": clarity,
                    "confidence_score": confidence,
                    "coverage_score": coverage,
                    "overall_score": overall,
                    "feedback_summary": summary_text,
                    "topic_scores": state,
                    **({"report": report} if report else {}),
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                }).eq("id", self.session_id).execute()
                log_activity(self.user_id, "presentation_completed", f"Completed live presentation ({overall}%)",
                             self.project_id, "presentation_session", self.session_id)
                gamification_service.award_xp(self.user_id, "presentation_completed")

            elif self.mode == "coach":
                # Communication Coach: store delivery metrics + recommendations
                # into the reused presentation_sessions row.
                coach_metrics = analysis.get("coach_metrics", {}) if isinstance(analysis, dict) else {}
                recommendations = analysis.get("recommendations", []) if isinstance(analysis, dict) else []
                summary["coach_metrics"] = coach_metrics
                summary["recommendations"] = recommendations
                row = sb.table("presentation_sessions").select("topic_scores").eq("id", self.session_id).execute()
                state = (row.data[0].get("topic_scores") if row.data else None) or {}
                if isinstance(state, str):
                    try:
                        state = json.loads(state)
                    except (ValueError, TypeError):
                        state = {}
                state.setdefault("slides", [])
                state.setdefault("topics", {})
                state["coach"] = True
                state["report"] = {
                    "coach_metrics": coach_metrics,
                    "recommendations": recommendations,
                    "strengths": summary.get("strengths", []),
                    "weaknesses": summary.get("weaknesses", []),
                    "flags": self.flags,
                    "transcript": turns,
                }
                sb.table("presentation_sessions").update({
                    "status": "Completed",
                    "overall_score": overall,
                    "confidence_score": coach_metrics.get("confidence", overall),
                    "clarity_score": coach_metrics.get("clarity", overall),
                    "coverage_score": coach_metrics.get("engagement", overall),
                    "feedback_summary": summary_text,
                    "topic_scores": state,
                    **({"report": report} if report else {}),
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                }).eq("id", self.session_id).execute()
                log_activity(self.user_id, "presentation_completed", f"Completed a communication coaching session ({overall}%)",
                             self.project_id, "presentation_session", self.session_id)
                gamification_service.award_xp(self.user_id, "presentation_completed")

            elif self.mode == "pitch":
                # Pitch now launches with a real presentation_sessions row
                # (session_type="Pitch"), so it can persist a report exactly
                # like presentation/coach instead of only logging activity.
                row = sb.table("presentation_sessions").select("topic_scores").eq("id", self.session_id).execute()
                state = (row.data[0].get("topic_scores") if row.data else None) or {}
                if isinstance(state, str):
                    try:
                        state = json.loads(state)
                    except (ValueError, TypeError):
                        state = {}
                state.setdefault("slides", [])
                state.setdefault("topics", {})
                state["report"] = {"flags": self.flags, "transcript": turns}
                sb.table("presentation_sessions").update({
                    "status": "Completed",
                    "clarity_score": overall,
                    "confidence_score": overall,
                    "coverage_score": overall,
                    "overall_score": overall,
                    "feedback_summary": summary_text,
                    "topic_scores": state,
                    **({"report": report} if report else {}),
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                }).eq("id", self.session_id).execute()
                log_activity(self.user_id, "pitch_completed", f"Completed a live pitch drill ({overall}%)",
                             self.project_id, "presentation_session", self.session_id)
                gamification_service.award_xp(self.user_id, "pitch_completed")
        except Exception as exc:  # never let persistence crash the socket close
            print(f"[live] finalize error ({self.mode}): {exc}")
        return summary


# --------------------------------------------------------------------------- #
# Gemini send helpers (tolerant of google-genai signature differences)
# --------------------------------------------------------------------------- #
_send_audio = live_service.send_audio


async def _send_image(session, data: bytes) -> None:
    blob = types.Blob(data=data, mime_type="image/jpeg")
    try:
        await session.send_realtime_input(video=blob)
    except TypeError:
        await session.send_realtime_input(media=blob)


async def _send_text(session, text: str) -> None:
    try:
        await session.send_realtime_input(text=text)
    except TypeError:
        await session.send_client_content(
            turns=types.Content(role="user", parts=[types.Part(text=text)]),
            turn_complete=True,
        )


# --------------------------------------------------------------------------- #
# WebSocket route
# --------------------------------------------------------------------------- #
@router.websocket("/ws/live/{mode}/{session_id}")
async def live_ws(websocket: WebSocket, mode: str, session_id: str):
    await websocket.accept()
    params = websocket.query_params
    token = params.get("token", "")
    language = params.get("language", "English")
    persona = params.get("persona", "balanced")
    project_id_param = params.get("project_id")
    subject_param = (params.get("subject") or "").strip() or None
    video_source = params.get("video") if params.get("video") in {"camera", "screen"} else None
    # Unique id for this WebSocket instance (for single-owner bookkeeping).
    connection_id = f"{id(websocket)}-{time.time_ns()}"

    user = user_from_token(token)
    if not user:
        await websocket.send_json({"type": "error", "message": "Authentication failed"})
        await websocket.close(code=4401)
        return

    if mode not in ("viva", "presentation", "pitch", "coach"):
        await websocket.send_json({"type": "error", "message": f"Unknown mode '{mode}'"})
        await websocket.close(code=4400)
        return

    # Latest connection wins for this session_id (do not reject — a stale
    # Strict-Mode / remount socket holding the lock caused "AI not speaking"
    # when the real client was refused). Greeting is still once-per-socket.
    async with _active_live_lock:
        prev = _active_live_owners.get(session_id)
        if prev and prev != connection_id:
            logger.info(
                "superseding previous live connection",
                extra={"session_id": session_id, "event": "live_ws_supersede"},
            )
        _active_live_owners[session_id] = connection_id

    # Resolve session + project context.
    sb = get_supabase()
    project_id = project_id_param
    subject = None
    scenario_id = None
    viva_session_type = None
    focus_topics: list[str] = []
    practice_questions: list[str] = []
    live_brief = ""
    try:
        if mode == "viva":
            res = sb.table("viva_sessions").select("*").eq("id", session_id).eq("profile_id", user["id"]).execute()
            if not res.data:
                raise ValueError("Session not found")
            row = res.data[0]
            project_id = row.get("project_id") or project_id
            persona = row.get("persona") or persona
            language = row.get("language") or language
            subject = row.get("subject")
            viva_session_type = row.get("session_type")
            ctx = row.get("context") or {}
            if isinstance(ctx, str):
                try:
                    ctx = json.loads(ctx)
                except (ValueError, TypeError):
                    ctx = {}
            if isinstance(ctx, dict):
                focus_topics = [
                    str(t).strip() for t in (ctx.get("focus_topics") or []) if str(t).strip()
                ]
                practice_questions = [
                    str(q).strip() for q in (ctx.get("practice_questions") or []) if str(q).strip()
                ]
                live_brief = str(ctx.get("live_brief") or "").strip()
            # If the session preloaded viva_questions but context bank is empty, load them.
            if not practice_questions:
                try:
                    qrows = (
                        sb.table("viva_questions").select("question_text,answer_text")
                        .eq("session_id", session_id)
                        .order("question_number")
                        .execute().data or []
                    )
                    practice_questions = [
                        str(q["question_text"]).strip()
                        for q in qrows
                        if q.get("question_text") and not q.get("answer_text")
                    ][:12]
                except Exception:
                    pass
            sb.table("viva_sessions").update({"status": "In Progress"}).eq("id", session_id).execute()
        elif mode in ("presentation", "coach", "pitch"):
            # Coach and Pitch sessions reuse the presentation_sessions table
            # (session_type="Coach" / "Pitch"), giving every live mode a real,
            # persisted row to finalize a report against.
            res = sb.table("presentation_sessions").select("*").eq("id", session_id).eq("profile_id", user["id"]).execute()
            if not res.data:
                raise ValueError("Session not found")
            row = res.data[0]
            project_id = row.get("project_id") or project_id
            # Presentation/coach/pitch store their free-text topic/scenario inside topic_scores JSONB.
            subject = ((row.get("topic_scores") or {}).get("subject")) or subject
            scenario_id = row.get("scenario_id")
            sb.table("presentation_sessions").update({"status": "In Progress"}).eq("id", session_id).execute()
    except Exception as exc:
        await websocket.send_json({"type": "error", "message": f"Could not load session: {exc}"})
        await websocket.close(code=4404)
        await _release_live_owner(session_id, connection_id)
        return

    # A subject explicitly sent by the client always wins (lets the student
    # personalize the session at launch time); otherwise fall back to stored.
    subject = subject_param or subject
    # Every mode gets a scenario contract. Coach sessions persist an explicit
    # registry id; legacy rows fall back to their stored label before a safe
    # default. Presentation and pitch use their natural implicit modes. Viva
    # differentiates by session_type — see resolve_viva_scenario_id.
    scenario = {
        "viva": get_scenario(resolve_viva_scenario_id(viva_session_type)),
        "presentation": get_scenario("project_presentation"),
        "pitch": get_scenario("elevator_pitch"),
    }.get(mode)
    if mode == "coach":
        scenario = get_scenario(scenario_id) or find_scenario_by_label(subject) or get_scenario("hr_interview")

    project_context = await asyncio.to_thread(_project_context, project_id)
    # Code-aware sessions: examiner brief is the distilled knowledge pack only.
    # Never inject full source into Live (free-tier + credibility).
    if mode == "viva" and live_brief:
        project_context = (
            live_brief
            + (
                "\n\nLinked project metadata (secondary):\n" + project_context
                if project_context.strip()
                else ""
            )
        )
    persist = LivePersistence(mode, session_id, user["id"], project_id, project_context, subject, scenario.id if scenario else None, video_source, persona)
    config = live_service.build_config(
        mode,
        persona,
        language,
        project_context,
        subject,
        student_name=user.get("name"),
        scenario=scenario,
        focus_topics=focus_topics or None,
        practice_questions=practice_questions or None,
    )

    errored = False
    end_requested = asyncio.Event()
    # Defense in depth for old/broken clients that lack the client gate-on-drain:
    # drop only AUDIO frames until the first Gemini turn_complete is forwarded.
    first_turn_done = asyncio.Event()
    try:
        async with live_service.connect_with_fallback(config) as session:
            await websocket.send_json({"type": "ready"})

            # Make the AI speak FIRST. Live models stay silent until they receive
            # a turn, so we send a short trigger to force the opening greeting.
            # Exactly once per WebSocket (this connection).
            try:
                trigger = live_service.greeting_trigger(mode, language, scenario)
                await session.send_client_content(
                    turns=types.Content(
                        role="user",
                        parts=[types.Part(text=trigger)],
                    ),
                    turn_complete=True,
                )
                logger.info(
                    "greeting trigger sent",
                    extra={"session_id": session_id, "mode": mode, "event": "greeting_trigger"},
                )
            except Exception as exc:
                logger.exception("greeting trigger failed session_id=%s", session_id)
                try:
                    await websocket.send_json(
                        {
                            "type": "error",
                            "message": f"Could not start the examiner voice: {exc}",
                        }
                    )
                except Exception:
                    pass

            async def client_to_gemini():
                while True:
                    msg = await websocket.receive()
                    if msg.get("type") == "websocket.disconnect":
                        break
                    data = msg.get("bytes")
                    if data is not None:
                        # Server-side gate: drop the student's mic audio until the
                        # first Gemini turn (the greeting) has completed, so the
                        # greeting cannot echo back and trigger a second greeting.
                        if not first_turn_done.is_set():
                            continue
                        await _send_audio(session, data)
                        continue
                    text = msg.get("text")
                    if text is None:
                        continue
                    try:
                        payload = json.loads(text)
                    except (ValueError, TypeError):
                        continue
                    kind = payload.get("type")
                    if kind == "image" and payload.get("data"):
                        persist.frames_received += 1
                        await _send_image(session, base64.b64decode(payload["data"]))
                    elif kind == "text" and payload.get("text"):
                        await _send_text(session, payload["text"])
                    elif kind == "end":
                        break

            async def gemini_to_client():
                # IMPORTANT: `session.receive()` yields a SINGLE model turn and
                # then ends (it breaks on turn_complete). We must re-enter it in
                # an outer loop so the conversation continues across turns —
                # otherwise the session dies right after the opening greeting.
                #
                # NOTE: Do not suppress AI audio here. An earlier "suppress second
                # opening" path dropped real greeting audio when the first turn
                # only had transcription / tool events, leaving the student silent.
                # Double openings are prevented by: single client start lock +
                # one greeting trigger per socket + client caption dedupe.
                while True:
                    got_turn = False
                    async for response in session.receive():
                        got_turn = True
                        try:
                            for audio_chunk in _response_audio_chunks(response):
                                if audio_chunk:
                                    await websocket.send_bytes(audio_chunk)
                        except Exception as audio_exc:
                            # Never let one bad PCM frame kill the whole receive
                            # loop — that was a silent "AI voice not coming" mode
                            # (transcripts could still arrive from later messages
                            # until the task fully died).
                            logger.warning(
                                "audio forward failed: %s",
                                audio_exc,
                                extra={"session_id": session_id, "event": "audio_forward_error"},
                            )
                        sc = getattr(response, "server_content", None)
                        if sc:
                            it = getattr(sc, "input_transcription", None)
                            if it and getattr(it, "text", None):
                                persist.on_user_text(it.text)
                                await websocket.send_json({"type": "user_transcript", "text": it.text})
                            ot = getattr(sc, "output_transcription", None)
                            if ot and getattr(ot, "text", None):
                                persist.on_ai_text(ot.text)
                                await websocket.send_json({"type": "ai_transcript", "text": ot.text})
                            if getattr(sc, "interrupted", None):
                                await websocket.send_json({"type": "interrupted"})
                            if getattr(sc, "turn_complete", None):
                                await _forward_turn_complete(websocket, first_turn_done)
                        tc = getattr(response, "tool_call", None)
                        if tc and tc.function_calls:
                            responses = []
                            for fc in tc.function_calls:
                                if fc.name == "end_session":
                                    end_requested.set()
                                    responses.append(
                                        types.FunctionResponse(id=fc.id, name=fc.name, response={"status": "ok"})
                                    )
                                    continue
                                event = persist.on_tool(fc.name, dict(fc.args or {}))
                                if event:
                                    await websocket.send_json(event)
                                tool_response = {"status": "ok"}
                                if event and event.get("id"):
                                    tool_response["question_id" if fc.name == "record_question" else "id"] = event["id"]
                                if fc.name == "record_question":
                                    # Do NOT tell the model to stay completely silent —
                                    # if record_question fires before spoken audio for the
                                    # first question, a hard "stay silent" kills AI voice.
                                    tool_response["instruction"] = (
                                        "Question logged. If you have not spoken this question "
                                        "aloud yet, speak it once now, then wait for the student. "
                                        "Do not greet again or re-introduce yourself."
                                    )
                                responses.append(
                                    types.FunctionResponse(id=fc.id, name=fc.name, response=tool_response)
                                )
                            try:
                                await session.send_tool_response(function_responses=responses)
                            except Exception:
                                pass
                            if end_requested.is_set():
                                await asyncio.sleep(0.5)
                                return
                    if not got_turn:
                        break

            async def _mic_gate_safety():
                # Never let a missing turn_complete keep the mic gated forever.
                await asyncio.sleep(_MIC_GATE_SAFETY_SECONDS)
                if not first_turn_done.is_set():
                    logger.warning(
                        "mic gate safety release fired (no turn_complete)",
                        extra={"session_id": session_id, "mode": mode, "event": "mic_gate_safety"},
                    )
                    first_turn_done.set()

            send_task = asyncio.create_task(client_to_gemini())
            recv_task = asyncio.create_task(gemini_to_client())
            safety_task = asyncio.create_task(_mic_gate_safety())
            done, pending = await asyncio.wait(
                {send_task, recv_task}, return_when=asyncio.FIRST_COMPLETED
            )
            if not safety_task.done():
                safety_task.cancel()
            for task in pending:
                task.cancel()
            for task in done:
                exc = task.exception()
                if exc and not isinstance(exc, (asyncio.CancelledError, WebSocketDisconnect)):
                    print(f"[live] task error: {exc}")

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        errored = True
        print(f"[live] session error: {exc}")
        try:
            await websocket.send_json({
                "type": "error",
                "message": f"Live AI engine error: {exc}. Check that GEMINI_API_KEY is set and google-genai>=2.10 is installed, then retry.",
            })
        except Exception:
            pass

    # Finalize + report back. Never fake a completed 0% session:
    # - on engine error, put the session back to Pending and DON'T send "ended"
    # - on a clean end with zero interaction, also revert instead of completing
    if errored or not persist.has_activity:
        await asyncio.to_thread(persist.revert_status)
        try:
            if not errored:
                await websocket.send_json({
                    "type": "error",
                    "message": "The session ended before any conversation happened, so nothing was recorded. Please try again.",
                })
            await websocket.close()
        except Exception:
            pass
        await _release_live_owner(session_id, connection_id)
        return

    # finalize() now does real work (transcript analysis + a report-generation
    # LLM call), which can take longer than the teardown that already happened.
    # Tell the client so it can extend its own force-close window from *this*
    # point rather than from when "end" was first sent.
    try:
        await websocket.send_json({"type": "finalizing"})
    except Exception:
        pass
    summary = await asyncio.to_thread(persist.finalize)
    try:
        await websocket.send_json({"type": "ended", "summary": summary})
        await websocket.close()
    except Exception:
        pass
    await _release_live_owner(session_id, connection_id)
