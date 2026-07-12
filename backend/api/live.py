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
from core.logging import get_logger
from services import gamification_service
from services.activity_service import log_activity

router = APIRouter(tags=["live"])
logger = get_logger("live")

# Safety release for the server-side mic gate: if the model never emits
# a turn_complete (e.g. greeting failed), stop dropping mic audio after this long
# so the session can never deadlock waiting for a greeting that isn't coming.
_MIC_GATE_SAFETY_SECONDS = 20


async def _forward_turn_complete(websocket: WebSocket, first_turn_done: asyncio.Event) -> None:
    """Notify the client before opening the server-side first-turn mic gate."""
    await websocket.send_json({"type": "turn_complete"})
    first_turn_done.set()


def _response_audio_chunks(response) -> list[bytes]:
    """Read Live audio from both SDK response layouts.

    Older ``google-genai`` releases exposed a convenience ``response.data``
    attribute.  Current Live responses place the raw 24kHz PCM chunks in
    ``server_content.model_turn.parts[].inline_data.data`` instead.  Output
    transcription still arrives either way, which is why the UI could show AI
    text while remaining silent.  Prefer the legacy convenience field when it
    exists to avoid forwarding one chunk twice on SDKs that expose both.
    """
    legacy_data = getattr(response, "data", None)
    if legacy_data:
        return [bytes(legacy_data)]

    server_content = getattr(response, "server_content", None)
    model_turn = getattr(server_content, "model_turn", None)
    chunks: list[bytes] = []
    for part in getattr(model_turn, "parts", None) or []:
        inline_data = getattr(part, "inline_data", None)
        data = getattr(inline_data, "data", None)
        mime_type = (getattr(inline_data, "mime_type", "") or "").lower()
        # Live model turns can contain text/thought parts as well as audio.
        # Only proxy audio bytes to the browser's PCM player.
        if data and (not mime_type or mime_type.startswith("audio/")):
            chunks.append(bytes(data))
    return chunks


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
    meta = dict(getattr(user, "user_metadata", None) or {})
    raw_name = (meta.get("full_name") or meta.get("name") or "").strip()
    # Use just the first name so the examiner addresses them naturally.
    first_name = raw_name.split()[0] if raw_name else ""
    return {"id": user.id, "email": user.email, "name": first_name}


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

    def on_tool(self, name: str, args: dict) -> dict | None:
        """Handle a model tool call; return a client event to forward (or None)."""
        if name == "log_observation":
            dimension = str(args.get("dimension") or "").strip()
            kind = str(args.get("kind") or "note")
            now = self.now_ms()
            if not dimension:
                return None
            if any(item.get("dimension") == dimension and item.get("kind") == kind and now - int(item.get("ts_ms", 0)) < 20_000 for item in self.observations):
                return None
            item = {
                "id": f"obs_{len(self.observations) + 1}", "ts_ms": now,
                "category": args.get("category", "communication"), "dimension": dimension,
                "kind": kind if kind in {"strength", "issue", "note"} else "note",
                "severity": args.get("severity", "low"), "confidence": args.get("confidence", "low"),
                "evidence": str(args.get("evidence") or ""), "tip": args.get("tip"),
            }
            if not item["evidence"]:
                return None
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
                state.setdefault("topics", {})
                state["qa"] = [
                    {"kind": "exam_q", "question": q.get("question"), "answer": q.get("answer"),
                     "score": q.get("score"), "feedback": q.get("feedback"), "answered": q.get("score") is not None}
                    for q in self.questions
                ]
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
    subject_param = (params.get("subject") or "").strip() or None
    video_source = params.get("video") if params.get("video") in {"camera", "screen"} else None

    user = _user_from_token(token)
    if not user:
        await websocket.send_json({"type": "error", "message": "Authentication failed"})
        await websocket.close(code=4401)
        return

    if mode not in ("viva", "presentation", "pitch", "coach"):
        await websocket.send_json({"type": "error", "message": f"Unknown mode '{mode}'"})
        await websocket.close(code=4400)
        return

    # Resolve session + project context.
    sb = get_supabase()
    project_id = project_id_param
    subject = None
    scenario_id = None
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
        return

    # A subject explicitly sent by the client always wins (lets the student
    # personalize the session at launch time); otherwise fall back to stored.
    subject = subject_param or subject
    # Every mode gets a scenario contract. Coach sessions persist an explicit
    # registry id; legacy rows fall back to their stored label before a safe
    # default. Viva, presentation and pitch use their natural implicit modes.
    scenario = {
        "viva": get_scenario("viva_defense"),
        "presentation": get_scenario("project_presentation"),
        "pitch": get_scenario("elevator_pitch"),
    }.get(mode)
    if mode == "coach":
        scenario = get_scenario(scenario_id) or find_scenario_by_label(subject) or get_scenario("hr_interview")

    project_context = await asyncio.to_thread(_project_context, project_id)
    persist = LivePersistence(mode, session_id, user["id"], project_id, project_context, subject, scenario.id if scenario else None, video_source, persona)
    config = live_service.build_config(
        mode, persona, language, project_context, subject, student_name=user.get("name"), scenario=scenario
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
            try:
                await session.send_client_content(
                    turns=types.Content(
                        role="user",
                        parts=[types.Part(text=live_service.greeting_trigger(mode, language, scenario))],
                    ),
                    turn_complete=True,
                )
            except Exception as exc:
                print(f"[live] greeting trigger failed: {exc}")

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
                        # Only audio is gated; text/image/end always pass through.
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
                while True:
                    got_turn = False
                    async for response in session.receive():
                        got_turn = True
                        for audio_chunk in _response_audio_chunks(response):
                            await websocket.send_bytes(audio_chunk)
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
                                    # The examiner has decided the session is over.
                                    # Acknowledge, flag for finalize, and stop receiving.
                                    end_requested.set()
                                    responses.append(
                                        types.FunctionResponse(id=fc.id, name=fc.name, response={"status": "ok"})
                                    )
                                    continue
                                event = persist.on_tool(fc.name, dict(fc.args or {}))
                                if event:
                                    await websocket.send_json(event)
                                responses.append(
                                    types.FunctionResponse(id=fc.id, name=fc.name, response={"status": "ok"})
                                )
                            try:
                                await session.send_tool_response(function_responses=responses)
                            except Exception:
                                pass
                            if end_requested.is_set():
                                # Give the final closing audio a moment to flush to
                                # the browser, then end the receive loop.
                                await asyncio.sleep(0.5)
                                return
                    # If a turn yielded nothing, the connection is gone — stop.
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
