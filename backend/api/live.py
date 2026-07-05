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
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from google.genai import types

from ai import live_service, viva_core
from core.database import get_supabase
from services import gamification_service
from services.activity_service import log_activity

router = APIRouter(tags=["live"])


# --------------------------------------------------------------------------- #
# Auth + context loading
# --------------------------------------------------------------------------- #
def _user_from_token(token: str) -> dict | None:
    try:
        res = get_supabase().auth.get_user(token)
        user = res.user
    except Exception:
        return None
    if not user:
        return None
    return {"id": user.id, "email": user.email}


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

    def __init__(self, mode: str, session_id: str, user_id: str, project_id: str | None):
        self.mode = mode
        self.session_id = session_id
        self.user_id = user_id
        self.project_id = project_id
        self.transcript: list[dict] = []
        self.flags: list[dict] = []
        self.questions: list[dict] = []  # {question, topic, answer, score, feedback}

    # -- live signals ------------------------------------------------------- #
    def on_user_text(self, text: str) -> None:
        self.transcript.append({"role": "student", "text": text})
        # Attach the student's words as the answer to the latest open question.
        for q in reversed(self.questions):
            if q.get("score") is None and not q.get("answer"):
                q["answer"] = text
                break

    def on_ai_text(self, text: str) -> None:
        self.transcript.append({"role": "examiner", "text": text})

    def on_tool(self, name: str, args: dict) -> dict | None:
        """Handle a model tool call; return a client event to forward (or None)."""
        if name == "flag_moment":
            item = {
                "kind": args.get("kind", "note"),
                "text": args.get("text", ""),
                "severity": args.get("severity", "low"),
            }
            self.flags.append(item)
            return {"type": "event", "event": "flag", **item}
        if name == "record_question":
            item = {
                "question": args.get("question", ""),
                "topic": args.get("topic"),
                "answer": None,
                "score": None,
                "feedback": None,
            }
            self.questions.append(item)
            return {"type": "event", "event": "question", "question": item["question"], "topic": item["topic"]}
        if name == "score_response":
            score = max(0, min(100, int(args.get("score", 0) or 0)))
            feedback = args.get("feedback")
            topic = args.get("topic")
            target = next((q for q in reversed(self.questions) if q.get("score") is None), None)
            if target is None:
                target = {"question": "(live discussion)", "topic": topic, "answer": None}
                self.questions.append(target)
            target["score"] = score
            target["feedback"] = feedback
            if topic and not target.get("topic"):
                target["topic"] = topic
            return {"type": "event", "event": "score", "score": score, "feedback": feedback, "topic": target.get("topic")}
        return None

    # -- finalize ----------------------------------------------------------- #
    def _avg_score(self) -> int:
        scored = [q["score"] for q in self.questions if q.get("score") is not None]
        return round(sum(scored) / len(scored)) if scored else 0

    def finalize(self) -> dict:
        """Persist to the same tables the report pages read. Runs in a worker thread."""
        sb = get_supabase()
        overall = self._avg_score()
        summary = {
            "overall_score": overall,
            "questions": self.questions,
            "flags": self.flags,
            "transcript": self.transcript,
        }
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
                state.setdefault("topics", {})
                state["qa"] = [
                    {"kind": "exam_q", "question": q.get("question"), "answer": q.get("answer"),
                     "score": q.get("score"), "feedback": q.get("feedback"), "answered": q.get("score") is not None}
                    for q in self.questions
                ]
                state["report"] = {"flags": self.flags, "transcript": self.transcript}
                sb.table("presentation_sessions").update({
                    "status": "Completed",
                    "clarity_score": overall,
                    "confidence_score": overall,
                    "coverage_score": overall,
                    "overall_score": overall,
                    "feedback_summary": f"Live presentation completed with {len(self.questions)} examiner questions.",
                    "topic_scores": state,
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                }).eq("id", self.session_id).execute()
                log_activity(self.user_id, "presentation_completed", f"Completed live presentation ({overall}%)",
                             self.project_id, "presentation_session", self.session_id)
                gamification_service.award_xp(self.user_id, "presentation_completed")

            elif self.mode == "pitch":
                log_activity(self.user_id, "pitch_completed", f"Completed a live pitch drill ({overall}%)", self.project_id)
                gamification_service.award_xp(self.user_id, "pitch_completed")
        except Exception as exc:  # never let persistence crash the socket close
            print(f"[live] finalize error ({self.mode}): {exc}")
        return summary


# --------------------------------------------------------------------------- #
# Gemini send helpers (tolerant of google-genai signature differences)
# --------------------------------------------------------------------------- #
async def _send_audio(session, data: bytes) -> None:
    blob = types.Blob(data=data, mime_type="audio/pcm;rate=16000")
    try:
        await session.send_realtime_input(audio=blob)
    except TypeError:
        await session.send_realtime_input(media=blob)


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

    user = _user_from_token(token)
    if not user:
        await websocket.send_json({"type": "error", "message": "Authentication failed"})
        await websocket.close(code=4401)
        return

    if mode not in ("viva", "presentation", "pitch"):
        await websocket.send_json({"type": "error", "message": f"Unknown mode '{mode}'"})
        await websocket.close(code=4400)
        return

    # Resolve session + project context.
    sb = get_supabase()
    project_id = project_id_param
    subject = None
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
            sb.table("viva_sessions").update({"status": "In Progress"}).eq("id", session_id).execute()
        elif mode == "presentation":
            res = sb.table("presentation_sessions").select("*").eq("id", session_id).eq("profile_id", user["id"]).execute()
            if not res.data:
                raise ValueError("Session not found")
            row = res.data[0]
            project_id = row.get("project_id") or project_id
            sb.table("presentation_sessions").update({"status": "In Progress"}).eq("id", session_id).execute()
        # pitch: stateless, project_id comes from the query param
    except Exception as exc:
        await websocket.send_json({"type": "error", "message": f"Could not load session: {exc}"})
        await websocket.close(code=4404)
        return

    project_context = await asyncio.to_thread(_project_context, project_id)
    persist = LivePersistence(mode, session_id, user["id"], project_id)
    config = live_service.build_config(mode, persona, language, project_context, subject)

    try:
        async with live_service.connect(config) as session:
            await websocket.send_json({"type": "ready"})

            async def client_to_gemini():
                while True:
                    msg = await websocket.receive()
                    if msg.get("type") == "websocket.disconnect":
                        break
                    data = msg.get("bytes")
                    if data is not None:
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
                        await _send_image(session, base64.b64decode(payload["data"]))
                    elif kind == "text" and payload.get("text"):
                        await _send_text(session, payload["text"])
                    elif kind == "end":
                        break

            async def gemini_to_client():
                async for response in session.receive():
                    if getattr(response, "data", None):
                        await websocket.send_bytes(response.data)
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
                            await websocket.send_json({"type": "turn_complete"})
                    tc = getattr(response, "tool_call", None)
                    if tc and tc.function_calls:
                        responses = []
                        for fc in tc.function_calls:
                            event = persist.on_tool(fc.name, dict(fc.args or {}))
                            if event:
                                await websocket.send_json(event)
                            responses.append(
                                types.FunctionResponse(id=fc.id, name=fc.name, response={"status": "ok"})
                            )
                        await session.send_tool_response(function_responses=responses)

            send_task = asyncio.create_task(client_to_gemini())
            recv_task = asyncio.create_task(gemini_to_client())
            done, pending = await asyncio.wait(
                {send_task, recv_task}, return_when=asyncio.FIRST_COMPLETED
            )
            for task in pending:
                task.cancel()
            for task in done:
                exc = task.exception()
                if exc and not isinstance(exc, (asyncio.CancelledError, WebSocketDisconnect)):
                    print(f"[live] task error: {exc}")

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        print(f"[live] session error: {exc}")
        try:
            await websocket.send_json({
                "type": "error",
                "message": "The live AI engine is temporarily unavailable. Please try again, or use the classic mode.",
            })
        except Exception:
            pass

    # Finalize + report back (best effort).
    summary = await asyncio.to_thread(persist.finalize)
    try:
        await websocket.send_json({"type": "ended", "summary": summary})
        await websocket.close()
    except Exception:
        pass
