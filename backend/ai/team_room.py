"""Voice Team Viva room: floor-controlled fan-out around ONE shared Gemini
Live connection.

Gemini Live is inherently single-interlocutor, so instead of giving each of
3-5 participants their own Gemini session, a VoiceRoom owns exactly one
connection (opened only once the lead starts the session). It fans the AI's
speech out to every connected participant, but forwards mic audio upstream
only from whichever single participant currently "has the floor" — granted by
the model itself via the `call_on_participant` tool (see team_live_service.py)
and revoked the instant the AI starts speaking again. Everyone else's mic
frames are silently dropped server-side, mirroring the drop-until-gated
pattern api/live.py already uses for its single-student greeting gate.
"""
from __future__ import annotations

import asyncio
import time
from datetime import datetime, timezone

from fastapi import WebSocket
from google.genai import types

from ai import live_service, team_live_service
from core.database import get_supabase
from core.logging import get_logger


logger = get_logger("team_room")

MIN_PARTICIPANTS_TO_START = 3
MAX_PARTICIPANTS = 5

# Mic frames buffered from the floor holder while a Gemini reconnect is in
# flight. Well over a reconnect's worth; past that the oldest are dropped.
INBOUND_QUEUE_MAX = 512


class TeamLivePersistence:
    """Collects a multi-speaker transcript + per-participant Q&A during a
    voice team viva. Shaped like api/live.py's LivePersistence, but every
    question/score/observation is tagged with which participant it belongs
    to, since floor control makes that attribution certain (unlike solo mode,
    which infers speaker from turn order alone)."""

    def __init__(self, session_id: str, team_id: str | None, project_id: str | None, project_context: str, subject: str | None):
        self.session_id = session_id
        self.team_id = team_id
        self.project_id = project_id
        self.project_context = project_context
        self.subject = subject
        self.started_at = time.monotonic()
        self.transcript: list[dict] = []  # {role, speaker_id, text, ts_ms}
        self.questions: list[dict] = []  # {id, participant_id, question, topic, answer, score, feedback, ts_ms}
        self.observations: list[dict] = []
        self._event_buffer: list[dict] = []

    def now_ms(self) -> int:
        return max(0, round((time.monotonic() - self.started_at) * 1000))

    def _buffer_event(self, participant_id: str | None, kind: str, payload: dict, ts_ms: int | None = None) -> None:
        if not participant_id:
            # session_events.profile_id is NOT NULL — AI-only turns (nobody
            # currently attributable) live in self.transcript only and get
            # persisted via viva_sessions.context.transcript at finalize.
            return
        self._event_buffer.append({
            "ts_ms": self.now_ms() if ts_ms is None else ts_ms,
            "kind": kind,
            "payload": payload,
            "profile_id": participant_id,
        })

    def flush_events(self) -> None:
        if not self._event_buffer:
            return
        rows = [
            {
                "session_id": self.session_id,
                "mode": "team_viva",
                "profile_id": e["profile_id"],
                "ts_ms": e["ts_ms"],
                "kind": e["kind"],
                "payload": e["payload"],
            }
            for e in self._event_buffer
        ]
        try:
            get_supabase().table("session_events").insert(rows).execute()
            self._event_buffer.clear()
        except Exception as exc:
            logger.warning(
                "team session event flush failed",
                exc_info=True,
                extra={"session_id": self.session_id, "mode": "team_viva", "event": "event_flush_failed"},
            )

    def on_ai_text(self, text: str) -> None:
        self.transcript.append({"role": "examiner", "speaker_id": None, "text": text, "ts_ms": self.now_ms()})

    def on_user_text(self, speaker_id: str | None, text: str) -> None:
        item = {"role": "student", "speaker_id": speaker_id, "text": text, "ts_ms": self.now_ms()}
        self.transcript.append(item)
        for q in reversed(self.questions):
            if q.get("participant_id") == speaker_id and q.get("score") is None and not q.get("answer"):
                q["answer"] = text
                break

    def on_question(self, participant_id: str, question: str, topic: str | None) -> dict:
        now = self.now_ms()
        item = {
            "id": f"q_{len(self.questions) + 1}",
            "participant_id": participant_id,
            "question": question or "(live discussion)",
            "topic": topic,
            "answer": None,
            "score": None,
            "feedback": None,
            "ts_ms": now,
        }
        self.questions.append(item)
        self._buffer_event(participant_id, "question", item, now)
        return item

    def on_score(self, participant_id: str | None, score, feedback, topic: str | None) -> dict | None:
        if not participant_id:
            return None
        try:
            score = max(0, min(100, int(score or 0)))
        except (TypeError, ValueError):
            score = 0
        now = self.now_ms()
        target = next(
            (q for q in reversed(self.questions) if q.get("participant_id") == participant_id and q.get("score") is None),
            None,
        )
        if target is None:
            target = {"id": f"q_{len(self.questions) + 1}", "participant_id": participant_id, "question": "(live discussion)", "topic": topic, "answer": None, "ts_ms": now}
            self.questions.append(target)
        target["score"] = score
        target["feedback"] = feedback
        if topic and not target.get("topic"):
            target["topic"] = topic
        self._buffer_event(participant_id, "score", target, now)
        return target

    def on_observation(self, participant_id: str | None, args: dict) -> None:
        evidence = str(args.get("evidence") or "").strip()
        if not evidence:
            return
        now = self.now_ms()
        item = {
            "id": f"obs_{len(self.observations) + 1}",
            "participant_id": participant_id,
            "kind": args.get("kind", "note"),
            "severity": args.get("severity", "low"),
            "evidence": evidence,
            "ts_ms": now,
        }
        self.observations.append(item)
        self._buffer_event(participant_id, "observation", item, now)

    @property
    def has_activity(self) -> bool:
        return any(t.get("role") == "student" and t.get("text") for t in self.transcript)

    def finalize(self, names: dict[str, str]) -> dict:
        """Persist to viva_questions/team_viva_scores/viva_sessions. Runs in a
        worker thread. Per-participant scoring comes directly from the
        model's own score_response calls (attributed via floor control, which
        is a stronger speaker signal than solo mode has), so — unlike solo
        mode — this does not need a second post-hoc grading pass."""
        sb = get_supabase()
        self.flush_events()

        by_participant: dict[str, list[dict]] = {}
        for q in self.questions:
            pid = q.get("participant_id")
            if pid:
                by_participant.setdefault(pid, []).append(q)

        member_summaries = []
        for pid, qs in by_participant.items():
            scored = [q["score"] for q in qs if q.get("score") is not None]
            individual_score = round(sum(scored) / len(scored)) if scored else 0
            member_summaries.append({
                "profile_id": pid,
                "name": names.get(pid, "Member"),
                "individual_score": individual_score,
                "questions_answered": len(scored),
            })
        team_score = round(sum(m["individual_score"] for m in member_summaries) / len(member_summaries)) if member_summaries else 0

        try:
            for i, q in enumerate(self.questions, start=1):
                sb.table("viva_questions").insert({
                    "session_id": self.session_id,
                    "question_number": i,
                    "question_text": q.get("question") or "(live discussion)",
                    "topic": q.get("topic"),
                    "answer_text": q.get("answer"),
                    "score": q.get("score"),
                    "feedback": q.get("feedback"),
                    "profile_id": q.get("participant_id"),
                }).execute()
            for m in member_summaries:
                sb.table("team_viva_scores").insert({
                    "session_id": self.session_id,
                    "team_id": self.team_id,
                    "profile_id": m["profile_id"],
                    "individual_score": m["individual_score"],
                    "questions_answered": m["questions_answered"],
                    "first_answers": 0,
                    "corrections_given": 0,
                    "team_score": team_score,
                }).execute()
            sb.table("viva_sessions").update({
                "status": "Completed",
                "score": team_score,
                "total_questions": len(self.questions),
                "answered_questions": len([q for q in self.questions if q.get("score") is not None]),
                "context": {"transcript": self.transcript},
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", self.session_id).execute()
        except Exception as exc:
            logger.warning(
                "team viva finalize persistence failed",
                exc_info=True,
                extra={"session_id": self.session_id, "mode": "team_viva", "event": "finalize_failed"},
            )

        return {"team_score": team_score, "members": member_summaries, "questions": self.questions}


class VoiceRoom:
    def __init__(self, session_id: str, team_id: str | None, lead_id: str):
        self.session_id = session_id
        self.team_id = team_id
        self.lead_id = lead_id
        self.connections: dict[str, WebSocket] = {}
        self.names: dict[str, str] = {}
        self.started = False
        self.gemini_session = None
        self.active_speaker_id: str | None = None
        self.pending_speaker_id: str | None = None
        # Sticky, unlike active_speaker_id: a score_response tool call for the
        # answer just given typically arrives in the AI's NEXT turn, by which
        # point active_speaker_id has already been reset to None (floor closes
        # the instant that next turn's audio starts). last_speaker_id keeps
        # pointing at that answerer until the model calls on someone new, so
        # attribution isn't lost.
        self.last_speaker_id: str | None = None
        self.persist: TeamLivePersistence | None = None
        self._gemini_ctx = None
        self._pump_task: asyncio.Task | None = None
        self._finalized = False
        self._final_summary: dict | None = None
        self._send_lock = asyncio.Lock()
        # Everything needed to rebuild the config when a connection recycles.
        self._connect_args: dict | None = None
        self._resume_handle: str | None = None
        # Whether the examiner has already delivered its one group greeting.
        # Tracked separately from `_resume_handle`, which only arrives seconds
        # into the viva and so cannot answer "did we greet yet?" during the
        # opening — the window where a drop either re-greets or goes mute.
        self._greeted = False
        self._end_requested = False
        # Floor-holder mic audio, buffered so a reconnect does not swallow the
        # middle of somebody's graded answer. Bounded: stale realtime audio is
        # worthless, so an overflow drops the OLDEST frames.
        self._inbound: asyncio.Queue = asyncio.Queue(maxsize=INBOUND_QUEUE_MAX)

    def _member_list(self) -> list[dict]:
        return [{"profile_id": pid, "name": self.names.get(pid, "Member")} for pid in self.connections]

    async def broadcast(self, message: dict) -> None:
        async with self._send_lock:
            for ws in list(self.connections.values()):
                try:
                    await ws.send_json(message)
                except Exception:
                    pass

    async def broadcast_bytes(self, data: bytes) -> None:
        async with self._send_lock:
            for ws in list(self.connections.values()):
                try:
                    await ws.send_bytes(data)
                except Exception:
                    pass

    async def connect(self, profile_id: str, name: str, ws: WebSocket) -> None:
        await ws.accept()
        self.connections[profile_id] = ws
        self.names[profile_id] = name
        await self.broadcast({
            "type": "lobby",
            "members": self._member_list(),
            "lead_id": self.lead_id,
            "ai_status": "live" if self.started else "muted",
        })

    async def disconnect(self, profile_id: str) -> None:
        self.connections.pop(profile_id, None)
        if self.connections:
            await self.broadcast({"type": "lobby", "members": self._member_list(), "lead_id": self.lead_id, "ai_status": "live" if self.started else "muted"})

    async def start(self, requester_id: str, project_id: str | None, project_context: str, subject: str | None, language: str, persona: str) -> None:
        if requester_id != self.lead_id:
            raise PermissionError("Only the team lead can start the viva")
        if self.started:
            return
        if len(self.connections) < MIN_PARTICIPANTS_TO_START:
            raise ValueError(f"Need at least {MIN_PARTICIPANTS_TO_START} members in the lobby to start")
        self.started = True
        self.persist = TeamLivePersistence(self.session_id, self.team_id, project_id, project_context, subject)
        roster = self._member_list()
        # Kept so a recycled connection can be rebuilt with the same contract.
        self._connect_args = {
            "roster": roster,
            "persona": persona,
            "language": language,
            "project_context": project_context,
            "subject": subject,
        }
        try:
            await self._open_connection()
        except Exception:
            # Leaving `started` True on a failed connect wedged the room
            # permanently — start() short-circuits on it, so the lead could
            # never retry and the lobby just sat there.
            self.started = False
            self._connect_args = None
            self.persist = None
            raise
        await self.broadcast({"type": "lobby", "members": roster, "lead_id": self.lead_id, "ai_status": "live"})
        await self._send_greeting()
        self._pump_task = asyncio.create_task(self._pump_gemini())

    async def _open_connection(self) -> None:
        """Open (or re-open) the room's single Gemini connection."""
        args = self._connect_args or {}
        config = team_live_service.build_team_config(
            args.get("roster") or self._member_list(),
            args.get("persona", "balanced"),
            args.get("language", "English"),
            args.get("project_context", ""),
            args.get("subject"),
            resume_handle=self._resume_handle,
        )
        ctx = live_service.connect_with_fallback(config)
        session = await ctx.__aenter__()
        self._gemini_ctx = ctx
        self.gemini_session = session

    async def _close_connection(self, exc: BaseException | None = None) -> None:
        ctx, self._gemini_ctx = self._gemini_ctx, None
        self.gemini_session = None
        if ctx is None:
            return
        try:
            await ctx.__aexit__(type(exc) if exc else None, exc, None)
        except Exception:
            pass

    async def _send_greeting(self) -> None:
        """Trigger the group opening — or resume without one.

        A Live model stays mute until it receives a turn, so a FRESH connection
        always needs a trigger. Which trigger depends on whether this room has
        greeted before: re-sending the opening makes the examiner greet the team
        a second time mid-viva, while sending nothing on a history-less reconnect
        leaves the room in silence for the rest of the exam.
        """
        language = (self._connect_args or {}).get("language", "English")
        trigger = (
            team_live_service.team_resume_trigger(language)
            if self._greeted
            else team_live_service.team_greeting_trigger(language)
        )
        try:
            await self.gemini_session.send_client_content(
                turns=types.Content(role="user", parts=[types.Part(text=trigger)]),
                turn_complete=True,
            )
            self._greeted = True
        except Exception as exc:
            logger.warning(
                "team greeting trigger failed",
                exc_info=True,
                extra={"session_id": self.session_id, "mode": "team_viva", "event": "greeting_trigger_failed"},
            )

    def _enqueue_audio(self, data: bytes) -> None:
        """Buffer one mic frame, dropping the OLDEST when full."""
        try:
            self._inbound.put_nowait(data)
            return
        except asyncio.QueueFull:
            pass
        try:
            self._inbound.get_nowait()
        except asyncio.QueueEmpty:
            return
        try:
            self._inbound.put_nowait(data)
        except asyncio.QueueFull:
            pass

    async def route_client_audio(self, profile_id: str, data: bytes) -> None:
        if not self.started:
            return
        if profile_id != self.active_speaker_id:
            return  # not this participant's turn — dropped server-side
        # Queued rather than sent inline so a reconnect in flight does not
        # swallow the middle of the floor holder's answer.
        self._enqueue_audio(data)

    async def _pump_audio(self, session) -> None:
        """Drain buffered floor audio into the currently-live Gemini session."""
        while True:
            data = await self._inbound.get()
            await live_service.send_audio(session, data)

    def _handle_tool(self, name: str, args: dict) -> dict | None:
        if name == "call_on_participant":
            participant_id = str(args.get("participant_id") or "").strip()
            if participant_id not in self.connections:
                return None  # model named someone outside the current roster
            question = str(args.get("question") or "").strip()
            topic = args.get("topic")
            self.pending_speaker_id = participant_id
            item = self.persist.on_question(participant_id, question, topic)
            return {"type": "event", "event": "question", "speaker_id": participant_id, "id": item["id"], "question": item["question"], "topic": topic}
        if name == "score_response":
            participant_id = str(args.get("participant_id") or "").strip() or self.last_speaker_id
            item = self.persist.on_score(participant_id, args.get("score"), args.get("feedback"), args.get("topic"))
            if not item:
                return None
            return {"type": "event", "event": "score", "speaker_id": participant_id, "score": item["score"], "feedback": item.get("feedback"), "topic": item.get("topic")}
        if name == "log_observation":
            participant_id = str(args.get("participant_id") or "").strip() or self.last_speaker_id
            self.persist.on_observation(participant_id, args)
            return None
        return None

    async def _receive_loop(self, session) -> None:
        """Forward ONE Gemini connection's stream to the whole room.

        `session.receive()` yields a single model turn and then ends, so it is
        re-entered in an outer loop. It never terminates by yielding nothing —
        when the connection ends it RAISES — so there is deliberately no
        "empty iteration" exit here. The old `if not got_turn: break` was
        unreachable, and the exception it was standing in for got swallowed by
        the caller, which is how a routine ~10-minute connection recycle
        silently ended a team viva and finalized it on a partial transcript.
        """
        while True:
            turn_floor_closed = False
            async for response in session.receive():
                audio_chunks = live_service.response_audio_chunks(response)
                if audio_chunks and not turn_floor_closed:
                    turn_floor_closed = True
                    self.active_speaker_id = None
                    await self.broadcast({"type": "floor", "speaker_id": None, "ai_speaking": True})
                for chunk in audio_chunks:
                    await self.broadcast_bytes(chunk)
                # Keep the newest resumption handle so a recycled connection can
                # pick the viva up exactly where it left off.
                sru = getattr(response, "session_resumption_update", None)
                if sru is not None and getattr(sru, "resumable", None) and getattr(sru, "new_handle", None):
                    self._resume_handle = sru.new_handle
                sc = getattr(response, "server_content", None)
                if sc:
                    it = getattr(sc, "input_transcription", None)
                    if it and getattr(it, "text", None):
                        self.persist.on_user_text(self.active_speaker_id, it.text)
                        await self.broadcast({"type": "user_transcript", "speaker_id": self.active_speaker_id, "text": it.text})
                    ot = getattr(sc, "output_transcription", None)
                    if ot and getattr(ot, "text", None):
                        self.persist.on_ai_text(ot.text)
                        await self.broadcast({"type": "ai_transcript", "text": ot.text})
                    if getattr(sc, "interrupted", None):
                        await self.broadcast({"type": "interrupted"})
                    if getattr(sc, "turn_complete", None):
                        self.active_speaker_id = self.pending_speaker_id
                        if self.active_speaker_id:
                            self.last_speaker_id = self.active_speaker_id
                        await self.broadcast({"type": "floor", "speaker_id": self.active_speaker_id, "ai_speaking": False})
                tc = getattr(response, "tool_call", None)
                if tc and tc.function_calls:
                    responses = []
                    for fc in tc.function_calls:
                        if fc.name == "end_session":
                            self._end_requested = True
                            responses.append(types.FunctionResponse(id=fc.id, name=fc.name, response={"status": "ok"}))
                            continue
                        event = self._handle_tool(fc.name, dict(fc.args or {}))
                        if event:
                            await self.broadcast(event)
                        responses.append(types.FunctionResponse(id=fc.id, name=fc.name, response={"status": "ok"}))
                    try:
                        await session.send_tool_response(function_responses=responses)
                    except Exception:
                        pass
                    if self._end_requested:
                        await asyncio.sleep(0.5)
                        return

    async def _run_connection(self) -> None:
        """Run the current connection until it ends, raising what killed it."""
        session = self.gemini_session
        recv_task = asyncio.create_task(self._receive_loop(session))
        pump_task = asyncio.create_task(self._pump_audio(session))
        watched = {recv_task, pump_task}
        try:
            done, _ = await asyncio.wait(watched, return_when=asyncio.FIRST_COMPLETED)
        finally:
            for task in watched:
                if not task.done():
                    task.cancel()
            await asyncio.gather(*watched, return_exceptions=True)
        # Surface a real transport failure rather than swallowing it.
        for task in (recv_task, pump_task):
            if task in done and not task.cancelled() and task.exception() is not None:
                raise task.exception()  # type: ignore[misc]

    async def _pump_gemini(self) -> None:
        """Supervise the room's Gemini connection across recycles.

        A connection ending is NOT the viva ending: the Live API recycles one
        roughly every ten minutes. Reconnect transparently with the resumption
        handle (and without re-greeting) so the team keeps going, and only
        finalize when the model calls end_session, the lead ends it, or the
        failure is genuinely unrecoverable.
        """
        reconnects = 0
        try:
            while True:
                try:
                    await self._run_connection()
                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    await self._close_connection(exc)
                    recoverable = (
                        live_service.is_recoverable_live_error(exc)
                        and reconnects < live_service.MAX_GEMINI_RECONNECTS
                        and not self._end_requested
                        and bool(self.connections)
                    )
                    if not recoverable:
                        logger.warning(
                            "team viva connection lost and not recoverable",
                            exc_info=True,
                            extra={"session_id": self.session_id, "mode": "team_viva",
                                   "event": "pump_giving_up", "reconnects": reconnects},
                        )
                        break
                    reconnects += 1
                    await self.broadcast({"type": "reconnecting", "attempt": reconnects})
                    await asyncio.sleep(live_service.reconnect_delay(reconnects))
                    try:
                        await self._open_connection()
                    except Exception as reopen_exc:
                        logger.warning(
                            "team viva reconnect failed",
                            exc_info=True,
                            extra={"session_id": self.session_id, "mode": "team_viva",
                                   "event": "reconnect_failed", "attempt": reconnects},
                        )
                        break
                    await self.broadcast({"type": "reconnected"})
                    # A reconnect that could NOT resume (no handle yet — the drop
                    # landed before Gemini issued one) has no conversation history
                    # and, like any fresh connection, will stay mute until it gets
                    # a turn. Nudge it back into questioning; `_send_greeting`
                    # picks the resume trigger, so the team is not greeted twice.
                    if self._resume_handle is None:
                        await self._send_greeting()
                    # Re-assert the floor so nobody's mic is left in limbo by
                    # the gap; the client gate keys off this broadcast.
                    await self.broadcast({
                        "type": "floor",
                        "speaker_id": self.active_speaker_id,
                        "ai_speaking": False,
                    })
                    continue
                break
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            logger.warning(
                "team viva pump error",
                exc_info=True,
                extra={"session_id": self.session_id, "mode": "team_viva", "event": "pump_error"},
            )
        finally:
            await self._finalize_and_close()

    async def end(self, requester_id: str) -> dict:
        if requester_id != self.lead_id:
            raise PermissionError("Only the team lead can end the viva")
        if self._pump_task and not self._pump_task.done():
            self._pump_task.cancel()
            try:
                await self._pump_task
            except (asyncio.CancelledError, Exception):
                pass
        return await self._finalize_and_close()

    async def _finalize_and_close(self) -> dict:
        if self._finalized:
            return self._final_summary or {}
        self._finalized = True
        await self._close_connection()
        summary: dict = {}
        if self.persist and self.persist.has_activity:
            summary = await asyncio.to_thread(self.persist.finalize, self.names)
        self._final_summary = summary
        await self.broadcast({"type": "ended", "summary": summary})
        return summary


class VoiceRoomManager:
    def __init__(self):
        self.rooms: dict[str, VoiceRoom] = {}

    def room(self, session_id: str, team_id: str | None, lead_id: str) -> VoiceRoom:
        room = self.rooms.get(session_id)
        if room is None:
            room = VoiceRoom(session_id, team_id, lead_id)
            self.rooms[session_id] = room
        return room

    def drop_if_empty(self, session_id: str) -> None:
        room = self.rooms.get(session_id)
        if room and not room.connections:
            self.rooms.pop(session_id, None)


manager = VoiceRoomManager()
