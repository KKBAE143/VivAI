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
from dataclasses import dataclass, field
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from google.genai import types

from ai import (
    delivery_metrics,
    delivery_observer,
    integrity,
    live_service,
    report_service,
    turn_grader,
    viva_core,
)
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
#
# Two values, because the two client generations gate the mic differently and a
# server release that fires FIRST defeats the client's gate entirely:
#   - protocol v1+ owns the gate and sends `mic_open` when greeting playback has
#     actually drained. Its own ceiling is GATE_MAX_WAIT_MS/GATE_SAFETY_MS (30s),
#     so the server must wait LONGER than that or it un-gates the mic while the
#     browser is still playing the greeting out loud — the greeting then echoes
#     speaker->mic, Gemini scores it as a student turn, and greets a second time.
#   - legacy clients have no such signal, so they keep the short release.
_MIC_GATE_SAFETY_SECONDS = 20
_MIC_GATE_SAFETY_SECONDS_CLIENT_GATED = 45

# How long past the chosen duration the examiner gets to close gracefully before
# the server ends the session itself. Long enough to finish a sentence and a
# closing remark, short enough that "5 minutes" still means something.
_OVERRUN_GRACE_SECONDS = 45

# Close code for a socket that a newer connection replaced. 4409 = "conflict".
WS_SUPERSEDED_CODE = 4409
# How long a superseded connection gets to finish tearing down before the new
# one stops waiting for it. Bounded so one wedged socket can never block a
# student's retry.
SUPERSEDE_DRAIN_SECONDS = 5.0

# Transparent-reconnect budget for the Gemini side of the bridge.
MAX_GEMINI_RECONNECTS = live_service.MAX_GEMINI_RECONNECTS
# Mic audio buffered while a reconnect is in flight. ~512 chunks is well over a
# reconnect's worth; past that we drop the OLDEST frames, because stale realtime
# audio is worthless and unbounded growth is not an option.
INBOUND_QUEUE_MAX = 512


@dataclass
class LiveSessionState:
    """State that outlives any one browser socket for a single app session.

    Exists for one fact: whether the examiner's opening was actually HEARD. That
    cannot live on the connection, because a reload or a remount replaces the
    connection while the student is still sitting the same viva — and a fresh
    connection with no memory of the opening will deliver another one.
    """

    # Set only once examiner audio has genuinely been forwarded to the browser.
    #
    # Deliberately not "we sent the greeting trigger". A trigger being accepted
    # proves nothing: if the AI service dies or refuses before producing audio
    # (the observed 1008), marking the session greeted on the strength of the
    # trigger tells the retry "you have already introduced yourself, just carry
    # on" — and a model with no history, forbidden to greet, simply says nothing
    # at all until the student speaks first. That is the silent examiner.
    opening_delivered: bool = False


_live_session_states: dict[str, LiveSessionState] = {}


@dataclass
class LiveOwner:
    """A single browser WebSocket's claim on an app session_id.

    Replaces the old ``dict[str, str]`` of connection ids, which recorded who
    "owned" a session but had no way to act on it: a second socket simply
    overwrote the first, leaving TWO live WebSockets and TWO Gemini sessions
    running, each sending its own greeting trigger. That was the double
    greeting. Holding the socket itself means a supersede can actually close
    the loser.
    """

    connection_id: str
    websocket: WebSocket
    superseded: asyncio.Event = field(default_factory=asyncio.Event)
    released: asyncio.Event = field(default_factory=asyncio.Event)
    # Shared with every other socket that has held this session.
    session_state: LiveSessionState = field(default_factory=LiveSessionState)


_active_live_owners: dict[str, LiveOwner] = {}
_active_live_lock = asyncio.Lock()


async def claim_live_owner(session_id: str, owner: LiveOwner) -> LiveOwner | None:
    """Make `owner` the sole live connection for `session_id`.

    Closes and drains any previous owner first, so exactly one WebSocket — and
    therefore exactly one Gemini session and one greeting — can ever be running
    for a session. Returns the superseded owner (for logging), if any.
    """
    async with _active_live_lock:
        previous = _active_live_owners.get(session_id)
        # Carry the session's opening state across the handover, so a reload does
        # not hand the student a second spoken introduction.
        owner.session_state = _live_session_states.setdefault(session_id, owner.session_state)
        _active_live_owners[session_id] = owner
    if previous is None or previous is owner:
        return None

    previous.superseded.set()
    try:
        await previous.websocket.close(code=WS_SUPERSEDED_CODE)
    except Exception:  # noqa: BLE001 — already gone is the outcome we wanted
        pass
    try:
        await asyncio.wait_for(previous.released.wait(), timeout=SUPERSEDE_DRAIN_SECONDS)
    except asyncio.TimeoutError:
        logger.warning(
            "superseded live connection did not drain in time",
            extra={"session_id": session_id, "event": "live_ws_supersede_timeout"},
        )
    return previous


async def release_live_owner(session_id: str, owner: LiveOwner) -> None:
    """Give up the claim. Safe to call twice, and safe when already superseded."""
    async with _active_live_lock:
        if _active_live_owners.get(session_id) is owner:
            _active_live_owners.pop(session_id, None)
            # Nobody holds this session any more, so the next socket for it is a
            # genuinely new sitting and must be greeted. Only the LAST owner
            # clears this: a superseded owner releasing after its replacement has
            # claimed the session must not wipe the state that replacement is
            # relying on.
            _live_session_states.pop(session_id, None)
    owner.released.set()


async def _forward_turn_complete(
    websocket: WebSocket, first_turn_done: asyncio.Event, open_gate: bool = True
) -> None:
    """Notify the client before opening the server-side first-turn mic gate.

    `open_gate=False` is used for clients that manage the gate themselves and
    tell us when their greeting playback has actually drained (see the
    `mic_open` message). Opening on turn_complete is several seconds too early
    for those clients — the browser is still playing the greeting out loud.
    """
    await websocket.send_json({"type": "turn_complete"})
    if open_gate:
        first_turn_done.set()


# Reconnect policy is shared with the Team Viva room, so it lives in the ai
# layer. Re-exported here because this module is where it is consumed and
# tested from.
is_recoverable_live_error = live_service.is_recoverable_live_error
_reconnect_delay = live_service.reconnect_delay


def should_finalize(*, superseded: bool, has_activity: bool) -> bool:
    """Whether this connection should write a report at teardown.

    Two rules, both learned from real failures:

    - A SUPERSEDED connection never finalizes and never reverts. It lost the
      session to a newer socket; touching the row would stomp on the connection
      that is actually running the exam (the old code let a stale socket revert
      a live session back to Pending).
    - Otherwise, finalize whenever the student actually spoke — INCLUDING after
      an engine error. A drop at minute twelve of a real viva must still produce
      the student's report; throwing away a full conversation because the
      transport died at the end is a worse failure than the one it guards.
    """
    if superseded:
        return False
    return has_activity


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
        # Integrity observations for this session, in order. Populated by
        # `_check_turn_integrity`; written into the session context at finalize so
        # faculty review sees it, and never used to adjust a score.
        self.integrity_flags: list[dict] = []
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
            logger.warning(
                "session event flush failed",
                exc_info=True,
                extra={"session_id": self.session_id, "mode": self.mode, "event": "event_flush_failed"},
            )

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

    def on_graded_turn(self, graded: dict) -> list[dict]:
        """Record one exchange graded from the transcript, mid-session.

        The server-side replacement for what `record_question` and
        `score_response` used to do from inside the examiner's speaking turn. Same
        rows, same client events, same shapes the panel already renders — the only
        difference is who produced them, which is the entire point: the examiner is
        now free to just talk.

        Returns the client events to forward, in order.
        """
        now = self.now_ms()
        item = {
            "id": f"q_{len(self.questions) + 1}",
            "question": str(graded.get("question") or "").strip() or "(live discussion)",
            "topic": graded.get("topic"),
            "answer": graded.get("answer"),
            "score": graded.get("score"),
            "feedback": graded.get("feedback"),
            "ts_ms": now,
        }
        self.questions.append(item)
        self._buffer_event("question", item, now)
        self._buffer_event("score", item, now)
        return [
            {"type": "event", "event": "question", "id": item["id"],
             "question": item["question"], "topic": item["topic"]},
            {"type": "event", "event": "score", "id": item["id"],
             "score": item["score"], "feedback": item["feedback"], "topic": item["topic"]},
        ]

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
            logger.warning(
                "could not revert session to Pending",
                exc_info=True,
                extra={"session_id": self.session_id, "mode": self.mode, "event": "revert_status_failed"},
            )

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
        # Defense in depth: delivery metrics are a nice-to-have section of the
        # report, but they used to be computed outside any guard, so one bad
        # arithmetic edge case (see delivery_metrics.total_spoken_ms) threw away
        # the whole graded session. Never let an optional metric do that again.
        try:
            metrics = delivery_metrics.from_transcript(turns)
        except Exception as exc:
            logger.warning(
                "delivery metrics failed",
                exc_info=True,
                extra={"session_id": self.session_id, "mode": self.mode, "event": "delivery_metrics_failed"},
            )
            metrics = {"available": False, "estimate": True}
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
            logger.warning(
                "transcript analysis failed",
                exc_info=True,
                extra={"session_id": self.session_id, "mode": self.mode, "event": "transcript_analysis_failed",
                       "turns": len(turns)},
            )

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
            logger.warning(
                "report build failed",
                exc_info=True,
                extra={"session_id": self.session_id, "mode": self.mode, "event": "report_build_failed",
                       "turns": len(turns), "questions": len(self.questions)},
            )
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
                        "feedback": _question_feedback(q),
                        # The review screen has rendered a "Model answer" block
                        # all along; nothing had ever written to this column.
                        "expected_answer": q.get("model_answer"),
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
                        # Proctoring evidence travels with the session, not in a
                        # separate audit trail, so a faculty member reviewing an
                        # assessed viva sees it beside the answers it relates to.
                        # Absent entirely when nothing was observed — an empty
                        # integrity section on a clean session reads like an
                        # accusation with no content.
                        **({"integrity": self.integrity_flags} if self.integrity_flags else {}),
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
            logger.warning(
                "session finalize persistence failed",
                exc_info=True,
                extra={"session_id": self.session_id, "mode": self.mode, "event": "finalize_failed"},
            )
        return summary


# --------------------------------------------------------------------------- #
# Gemini send helpers (tolerant of google-genai signature differences)
# --------------------------------------------------------------------------- #
_send_audio = live_service.send_audio


# The longest a session with no configured duration is allowed to run. Only a
# backstop: every session created through the UI carries its own duration, and a
# scenario supplies one for legacy rows. This catches the remaining case so that
# no session can run unbounded now that the model cannot end one itself.
_FALLBACK_SESSION_MINUTES = 30


# There is deliberately no "silent question recovery" here any more.
#
# When the examiner logged a question with a tool call but produced no audio, the
# server used to send a follow-up trigger asking it to speak that question. It
# reliably made things worse: the nudge produced a SECOND caption for the same
# question, and the spoken turn often came back in a different language from the
# recorded one. Both are exactly the defects this feature was meant to hide.
#
# The cause was never the missing nudge — it was the tool call. See
# LIVE_TOOLS_ENABLED in ai/live_service.py. With no tools on the live session a
# turn cannot end as a function call with no speech, so there is nothing to
# rescue, and the report is rebuilt from the transcript at finalize regardless.


def _fatal_live_retryable(exc: BaseException) -> bool:
    """Could starting this session again plausibly work?

    A refused or dropped connection, or an exhausted quota, is worth another go.
    Rejected credentials are not — offering Retry there just gets pressed
    repeatedly. Defaults to True: an unclassified failure keeps the button, because
    withholding a retry the student could have used is the worse mistake.
    """
    detail = str(exc).lower()
    code = getattr(exc, "code", None)
    if "api key" in detail or "unauthenticated" in detail or code in (401, 403):
        return False
    return True


def _fatal_live_message(exc: BaseException) -> str:
    """What to tell the student when the live engine will not come up.

    Every failure used to be reported as "check that GEMINI_API_KEY is set and
    google-genai is installed", which is developer-facing advice a student cannot
    act on — and usually wrong. The observed failure in practice is the AI service
    itself refusing or dropping the connection (a WebSocket 1008/1011), which is
    transient and genuinely worth retrying. Sending a student to check an
    environment variable for that is worse than saying nothing.
    """
    code = getattr(exc, "code", None)
    detail = str(exc)
    if code in (1008, 1011) or "aborted" in detail.lower():
        return (
            "The AI examiner service refused the connection just now. This is usually temporary — "
            "please retry in a moment. Nothing you said was lost."
        )
    if "quota" in detail.lower() or "resource_exhausted" in detail.lower() or code == 429:
        return (
            "The AI service has hit its usage limit for now, so the examiner could not start. "
            "Try again a little later."
        )
    if "api key" in detail.lower() or "unauthenticated" in detail.lower() or code in (401, 403):
        return (
            "The AI service rejected our credentials, so the examiner could not start. "
            "This one is on us — please report it if it keeps happening."
        )
    return (
        f"The examiner could not be started ({type(exc).__name__}). Please retry — if this keeps "
        "happening, report it and we will look at the logs."
    )


async def _observe_delivery(
    *, text: str, seconds: float | None, persist, websocket: WebSocket,
    session_id: str, language: str,
) -> None:
    """Push delivery coaching for one finished turn to the live panel.

    The replacement for the coach's `log_observation` calls. Deterministic and
    therefore synchronous — it is arithmetic over words already in memory, with no
    network call to wait for, so unlike grading it does not need a detached task.

    Routed through the existing `log_observation` handler, which already dedupes
    near-identical evidence inside a 20-second window. That dedupe is why the same
    pace note does not stack up turn after turn.
    """
    try:
        observations = delivery_observer.observe_turn(
            text, seconds=seconds, language=language
        )
    except Exception:  # noqa: BLE001 — coaching must never break an exam
        logger.warning(
            "delivery observation failed",
            exc_info=True,
            extra={"session_id": session_id, "event": "delivery_observe_failed",
                   "swallowed": True},
        )
        return
    for observation in observations:
        event = persist.on_tool("log_observation", observation)
        if not event:
            continue
        try:
            await websocket.send_json(event)
        except Exception:  # noqa: BLE001 — the socket may already be closing
            return


async def _check_turn_integrity(
    *, text: str, seconds: float | None, focus_lost: bool, websocket: WebSocket,
    persist, session_id: str, mode: str, state: dict,
) -> None:
    """Assess one finished student turn, and warn at most once per session.

    Warning PAUSES nothing on the server: the Gemini connection stays exactly as
    it is and the client pauses itself, so resuming continues the same
    conversation from the same point. Tearing the connection down to interrupt
    somebody would lose the viva and re-trigger the greeting — the original bug.

    The outcome is a doubt raised with the student and a flag for the faculty
    member. It never touches the score. Signals are recorded even when they fall
    below the warning threshold, because a pattern across a session is what a human
    reviewer can judge and a single turn is not.
    """
    try:
        verdict = integrity.assess_turn(text, seconds=seconds, focus_lost=focus_lost)
    except Exception:  # noqa: BLE001 — never let proctoring break an exam
        logger.warning(
            "integrity assessment failed",
            exc_info=True,
            extra={"session_id": session_id, "mode": mode, "event": "integrity_check_failed",
                   "swallowed": True},
        )
        return
    if not verdict["signals"]:
        return

    persist.integrity_flags.append({
        "signals": verdict["signals"],
        "score": verdict["score"],
        "confidence": verdict["confidence"],
        "warned": verdict["suspicious"] and not state["warned"],
        "ts_ms": persist.now_ms(),
    })
    logger.info(
        "integrity signals observed",
        extra={"session_id": session_id, "mode": mode, "event": "integrity_signals",
               "reason": ",".join(verdict["signals"])[:200]},
    )

    if not verdict["suspicious"] or state["warned"]:
        return
    state["warned"] = True
    await websocket.send_json({
        "type": "integrity_warning",
        "message": integrity.WARNING_MESSAGE,
        "signals": integrity.describe(verdict["signals"]),
        "confidence": verdict["confidence"],
    })


def last_examiner_turn(transcript: list[dict]) -> str:
    """The examiner turn that just finished, from the transcript.

    Used to decide whether it asked a question or delivered a closing remark. Read
    from the transcript rather than from a tool call, so it does not depend on the
    examiner reporting anything about itself.
    """
    for item in reversed(coalesce_turns(transcript)):
        if item.get("role") == "examiner":
            return str(item.get("text") or "")
    return ""


def last_examiner_question(transcript: list[dict]) -> str:
    """The question the student was answering, from the transcript so far.

    Called at the moment the examiner starts replying, so the transcript ends with
    the student's answer and the examiner turn before it is the question. Reading
    it from the transcript rather than from a tool call is what makes this
    independent of the examiner's cooperation.
    """
    turns = coalesce_turns(transcript)
    last_student = next(
        (i for i in range(len(turns) - 1, -1, -1) if turns[i].get("role") == "student"), None
    )
    if last_student is None:
        return ""
    for i in range(last_student - 1, -1, -1):
        if turns[i].get("role") == "examiner":
            return str(turns[i].get("text") or "")
    return ""


# How long both sides must stay completely silent after the examiner delivers a
# closing remark before the server treats the session as finished. Long enough that
# a student drawing breath to ask one last thing is never cut off, short enough
# that nobody sits watching a dead screen wondering whether to press End.
_CLOSING_SILENCE_SECONDS = 25


# At most this many gradings may be in flight for one session. A student who
# answers three questions while a rate-limited key is still thinking about the
# first must not accumulate work — the exchange is graded again at finalize, so
# dropping one here costs the panel an entry and costs the report nothing.
_MAX_INFLIGHT_GRADINGS = 2


async def _grade_turn_live(
    *, answer: str, persist, websocket: WebSocket, session_id: str, mode: str,
) -> None:
    """Grade the exchange that just finished and push it to the live panel.

    Runs as a detached task. Everything here is best-effort by design: it must be
    impossible for a grading failure, a slow key or a closing socket to disturb the
    conversation, because the conversation is the product and this is a side panel.
    """
    question = last_examiner_question(persist.transcript)
    if not turn_grader.should_grade(question, answer):
        return
    try:
        graded = await asyncio.to_thread(
            turn_grader.grade_exchange,
            mode=mode,
            question=question,
            answer=answer,
            project_context=persist.project_context,
            subject=persist.subject,
        )
    except Exception:  # noqa: BLE001 — never let the panel break the exam
        logger.warning(
            "live turn grading failed",
            exc_info=True,
            extra={"session_id": session_id, "mode": mode, "event": "turn_grade_failed",
                   "swallowed": True},
        )
        return
    if not graded:
        return
    graded["answer"] = answer
    for event in persist.on_graded_turn(graded):
        try:
            await websocket.send_json(event)
        except Exception:  # noqa: BLE001 — the socket may already be closing
            return


def _question_feedback(q: dict) -> str | None:
    """Feedback plus what was missing, as one readable block.

    The grader now returns `missing` and `follow_up` separately, but
    `viva_questions` has one feedback column and the review screen renders it
    verbatim. Folding them in here gets the detail in front of the student
    without a migration; splitting them into their own columns is a later change.
    """
    parts: list[str] = []
    base = str(q.get("feedback") or "").strip()
    if base:
        parts.append(base)
    missing = q.get("missing") or []
    if isinstance(missing, str):
        missing = [missing]
    missing = [str(m).strip() for m in missing if str(m).strip()]
    if missing:
        parts.append("Missing: " + "; ".join(missing) + ".")
    follow_up = str(q.get("follow_up") or "").strip()
    if follow_up:
        parts.append(f"Revise: {follow_up}")
    return "\n\n".join(parts) or None


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
    # Clients from protocol version 1 onward own the mic gate themselves and
    # tell us when their greeting playback has actually drained. Older clients
    # get the legacy turn_complete-based gate.
    try:
        client_protocol = int(params.get("pv") or 0)
    except (TypeError, ValueError):
        client_protocol = 0
    client_owns_mic_gate = client_protocol >= 1

    user = user_from_token(token)
    if not user:
        await websocket.send_json({"type": "error", "message": "Authentication failed"})
        await websocket.close(code=4401)
        return

    if mode not in ("viva", "presentation", "pitch", "coach"):
        await websocket.send_json({"type": "error", "message": f"Unknown mode '{mode}'"})
        await websocket.close(code=4400)
        return

    # Latest connection wins for this session_id, and the loser is actually
    # CLOSED and drained before we continue (do not merely reject the newcomer —
    # a stale remount socket holding the lock used to cause "AI not speaking").
    # This is what guarantees one Gemini session, and therefore one greeting.
    owner = LiveOwner(connection_id=connection_id, websocket=websocket)
    superseded_owner = await claim_live_owner(session_id, owner)
    if superseded_owner is not None:
        logger.info(
            "superseded previous live connection",
            extra={"session_id": session_id, "event": "live_ws_supersede"},
        )

    # Resolve session + project context.
    sb = get_supabase()
    project_id = project_id_param
    subject = None
    scenario_id = None
    viva_session_type = None
    focus_topics: list[str] = []
    practice_questions: list[str] = []
    live_brief = ""
    # The length the student actually chose. Read off the session row for every
    # mode: it was being stored at creation and then never read by anything, so
    # picking "5 minutes" changed nothing at all — no prompt budget, no countdown,
    # no stop. See `session_clock` below for the enforcement half.
    duration_minutes: int | None = None
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
            duration_minutes = row.get("duration_minutes")
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
            duration_minutes = row.get("duration_minutes")
            sb.table("presentation_sessions").update({"status": "In Progress"}).eq("id", session_id).execute()
    except Exception as exc:
        await websocket.send_json({"type": "error", "message": f"Could not load session: {exc}"})
        await websocket.close(code=4404)
        await release_live_owner(session_id, owner)
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

    # Normalise the chosen length. A legacy row with no value falls back to the
    # scenario's own default rather than to "unlimited", so an old session gets a
    # sane clock instead of none at all.
    try:
        budget_minutes = int(duration_minutes or 0)
    except (TypeError, ValueError):
        budget_minutes = 0
    if budget_minutes <= 0 and scenario is not None:
        budget_minutes = int(getattr(scenario, "default_duration_min", 0) or 0)
    if budget_minutes <= 0:
        # There is no `end_session` tool any more (see LIVE_TOOLS_ENABLED), so the
        # model can no longer close a session itself. Without a ceiling a session
        # with no configured duration would stay open — and billable — until the
        # student pressed End or the tab died. A generous cap keeps that bounded
        # without ever cutting a real session short.
        budget_minutes = _FALLBACK_SESSION_MINUTES
    budget_minutes = max(0, min(120, budget_minutes))

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

    def make_config(handle: str | None):
        return live_service.build_config(
            mode,
            persona,
            language,
            project_context,
            subject,
            student_name=user.get("name"),
            scenario=scenario,
            focus_topics=focus_topics or None,
            practice_questions=practice_questions or None,
            duration_minutes=budget_minutes or None,
            # The connection being built knows whether this session has already
            # been greeted, so the model is never instructed to open a session
            # that is already underway. A user-turn nudge could not override the
            # system instruction telling it to say hello; this removes the
            # instruction instead.
            already_greeted=greeted,
            resume_handle=handle,
        )

    class StudentTurn:
        """The student's current answer, accumulated across transcript fragments.

        Speech-to-text arrives in pieces, so no single fragment is an answer. The
        integrity check needs the whole turn — its length, its pace, and whether
        the student was in another window while giving it — which only exists once
        the examiner starts replying.
        """

        def __init__(self) -> None:
            self.parts: list[str] = []
            self.started_at: float | None = None
            self.focus_lost = False
            self.focus_lost_total = 0

        def add(self, text: str) -> None:
            if self.started_at is None:
                self.started_at = time.monotonic()
            self.parts.append(text)

        @property
        def text(self) -> str:
            return " ".join(p.strip() for p in self.parts if p.strip()).strip()

        def take(self) -> tuple[str, float | None, bool]:
            """Consume the turn, returning (text, seconds, focus_lost)."""
            text = self.text
            seconds = (
                time.monotonic() - self.started_at if self.started_at is not None else None
            )
            focus_lost = self.focus_lost
            self.parts = []
            self.started_at = None
            self.focus_lost = False
            return text, seconds, focus_lost


    turn = StudentTurn()
    # One warning per session, by design. A detector this indirect gets to raise a
    # doubt once; repeating it every turn would turn a suspicion into harassment.
    # A dict rather than a bool because the flag is set from a nested coroutine.
    integrity_state: dict = {"warned": False}

    # Live grading tasks, held only so they can be counted and cancelled. They are
    # deliberately detached from the conversation: the examiner never waits for one.
    grading_tasks: set[asyncio.Task] = set()

    # How many real questions the examiner has asked, counted from the transcript.
    # Deliberately not `len(persist.questions)`: grading is asynchronous and skips
    # short answers, so it lags and undercounts, and this gates an ending.
    asked = {"count": 0}
    closing_task: asyncio.Task | None = None

    def planned_questions() -> int:
        low, _ = live_service.question_budget_for(budget_minutes or None)
        return low

    def questions_asked() -> int:
        """How many real questions have been asked, by the best available count.

        Two independent counts, each of which can only ever be too LOW:

        * cue-matched examiner turns, which miss a language the cue list does not
          cover;
        * successfully graded exchanges, which are language-independent but lag
          behind and skip very short answers.

        Taking the larger gets the best coverage from both. Undercounting is the
        safe direction — it keeps the automatic ending disarmed.
        """
        return max(asked["count"], len(persist.questions))

    def cancel_closing() -> None:
        """Anything at all happening means the session is not over."""
        nonlocal closing_task
        if closing_task is not None and not closing_task.done():
            closing_task.cancel()
        closing_task = None

    async def closing_watch(text: str) -> None:
        """End the session once the examiner has clearly finished.

        Replaces the `end_session` tool call. The tool was the model's decision
        announced from inside a speaking turn, which is what silenced the voice;
        this is an observation about a turn that has already finished.

        Three conditions, in the order that costs least:
          1. The examiner has asked its planned number of questions.
          2. Both sides then stay silent for `_CLOSING_SILENCE_SECONDS`. Any
             activity from either cancels this task outright.
          3. A separate model call confirms the turn was a closing remark rather
             than a question. This has to be a model call: "that's everything from
             my side" is different in every language a student can pick, and a
             phrase list would only work in English.

        Biased hard against firing at every step, and the confirmation fails closed.
        Ending a live exam early destroys a student's session; failing to end one
        means pressing a button that is already on screen.
        """
        await asyncio.sleep(_CLOSING_SILENCE_SECONDS)
        if end_requested.is_set() or browser_gone.is_set():
            return
        if questions_asked() < planned_questions():
            # A grading may have landed since this was armed and revised the count
            # down; re-check rather than trust the arming decision.
            return
        if not await asyncio.to_thread(turn_grader.examiner_closed, text):
            logger.info(
                "silence after a question-less turn, but it was not a closing",
                extra={"session_id": session_id, "mode": mode, "event": "live_closing_rejected",
                       "questions": asked["count"]},
            )
            return
        if end_requested.is_set() or browser_gone.is_set():
            return
        logger.info(
            "examiner closed and went silent — ending the session",
            extra={"session_id": session_id, "mode": mode, "event": "live_examiner_closed",
                   "reason": "closing_remark_then_silence", "questions": asked["count"]},
        )
        try:
            await websocket.send_json({"type": "time_up", "grace_seconds": 0})
        except Exception:  # noqa: BLE001 — the socket may already be closing
            pass
        end_requested.set()

    def note_examiner_turn(text: str) -> None:
        """Count a finished examiner turn, and arm the ending if it may be a closing.

        The question count uses the cue lists, which do not cover every language.
        That is safe in this direction: an uncounted question keeps the count LOW,
        which keeps the ending disarmed for longer. It can never end a session early.
        """
        nonlocal closing_task
        cancel_closing()
        if turn_grader.looks_like_a_question(text):
            asked["count"] += 1
            return
        if questions_asked() < planned_questions():
            # It stopped asking early — the student may still have something to
            # say, or it may simply have paused. Not our call to end it.
            return
        closing_task = asyncio.create_task(closing_watch(text))

    def spawn_grading(answer: str) -> None:
        """Start grading a finished exchange, or skip it if we are already behind."""
        for task in list(grading_tasks):
            if task.done():
                grading_tasks.discard(task)
        if len(grading_tasks) >= _MAX_INFLIGHT_GRADINGS:
            logger.info(
                "skipping live grading — already behind",
                extra={"session_id": session_id, "mode": mode, "event": "turn_grade_skipped",
                       "reason": "inflight_limit"},
            )
            return
        task = asyncio.create_task(
            _grade_turn_live(
                answer=answer, persist=persist, websocket=websocket,
                session_id=session_id, mode=mode,
            )
        )
        grading_tasks.add(task)
        # Discard on completion so a long session cannot accumulate finished tasks,
        # and so an unobserved exception is never silently dropped by the loop.
        task.add_done_callback(grading_tasks.discard)

    errored = False
    fatal_message = ""
    fatal_retryable = True
    ready_sent = False
    # Whether the examiner has ALREADY delivered its one opening greeting in this
    # app session. Deliberately separate from the resumption handle: the handle
    # arrives seconds into the session, so it cannot answer "did we greet yet?"
    # during the opening — the window where a drop used to re-greet.
    # Seeded from the session, not from this connection: a replacement socket for a
    # viva already in progress must not replay an audible opening.
    greeted = owner.session_state.opening_delivered
    reconnects = 0
    resume_handle: str | None = None
    end_requested = asyncio.Event()
    browser_gone = asyncio.Event()
    # Defense in depth for old/broken clients that lack the client gate-on-drain:
    # drop only AUDIO frames until the client says its greeting playback drained
    # (protocol v1+) or, for legacy clients, until the first turn_complete.
    first_turn_done = asyncio.Event()
    # Everything the browser sends, decoupled from whichever Gemini connection
    # currently happens to be live. This decoupling is what lets a Gemini
    # reconnect happen without dropping the student mid-sentence.
    inbound: asyncio.Queue = asyncio.Queue(maxsize=INBOUND_QUEUE_MAX)

    def enqueue(item: tuple) -> None:
        """Queue one item for Gemini, dropping the OLDEST frame when full.

        Realtime audio that is seconds stale is worthless, so shedding the
        front of the queue keeps latency honest while a reconnect completes —
        and keeps memory bounded no matter how long the stall lasts.
        """
        try:
            inbound.put_nowait(item)
            return
        except asyncio.QueueFull:
            pass
        try:
            inbound.get_nowait()
        except asyncio.QueueEmpty:
            return
        try:
            inbound.put_nowait(item)
        except asyncio.QueueFull:
            pass

    async def browser_reader():
        """Read the browser socket for the WHOLE session lifetime.

        Wrapped so that ANY failure here still flags the browser as gone. This
        task is nobody's `await` target, so an unobserved exception would leave
        the supervisor waiting on a socket that is never going to speak again.
        """
        try:
            await _browser_reader_loop()
        except (WebSocketDisconnect, RuntimeError):
            pass
        except Exception:  # noqa: BLE001
            logger.exception("browser reader failed session_id=%s", session_id)
        finally:
            # A clean "end" is the student finishing, not the browser vanishing;
            # only the latter should look like a lost socket to the supervisor.
            if not end_requested.is_set():
                browser_gone.set()

    async def _browser_reader_loop():
        while True:
            msg = await websocket.receive()
            if msg.get("type") == "websocket.disconnect":
                return
            data = msg.get("bytes")
            if data is not None:
                # Server-side mic gate: drop the student's audio until the
                # opening greeting has finished playing on their speakers, so
                # it cannot echo back into the mic and be heard as a student
                # turn — which is what makes the model greet a second time.
                if not first_turn_done.is_set():
                    continue
                enqueue(("audio", data))
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
                enqueue(("image", base64.b64decode(payload["data"])))
            elif kind == "text" and payload.get("text"):
                enqueue(("text", payload["text"]))
            elif kind == "focus_lost":
                # The student left the session window. Recorded against the turn
                # in progress, because leaving WHILE answering is the one
                # integrity signal that does not depend on how somebody talks.
                turn.focus_lost = True
                turn.focus_lost_total += 1
            elif kind == "focus_regained":
                pass  # the loss is what matters; the return is not evidence
            elif kind == "mic_open":
                # The client's greeting playback has genuinely drained. This —
                # not turn_complete, which fires while seconds of greeting are
                # still queued in the browser's audio graph — is the moment it
                # is safe to accept mic audio. One source of truth, the side
                # that actually knows when the speakers went quiet.
                first_turn_done.set()
            elif kind == "end":
                end_requested.set()
                return

    async def pump_to_gemini(session):
        """Drain the inbound queue into the currently-live Gemini session."""
        while True:
            kind, payload = await inbound.get()
            if kind == "audio":
                await _send_audio(session, payload)
            elif kind == "image":
                await _send_image(session, payload)
            elif kind == "text":
                await _send_text(session, payload)

    async def gemini_to_client(session):
        """Forward one Gemini connection's stream to the browser.

        `session.receive()` yields a SINGLE model turn and then ends (it breaks
        on turn_complete), so it is re-entered in an outer loop to continue the
        conversation across turns. It never terminates by yielding nothing —
        when the connection ends it RAISES — so there is deliberately no
        "empty iteration" exit here; the supervisor below classifies the
        exception and reconnects or finalizes.
        """
        nonlocal resume_handle, greeted
        while True:
            async for response in session.receive():
                try:
                    for audio_chunk in _response_audio_chunks(response):
                        if audio_chunk:
                            # A socket that has lost ownership must not leak one
                            # more frame after its replacement has started
                            # speaking. That overlap alone was enough to make two
                            # openings audible at once.
                            if owner.superseded.is_set():
                                return
                            await websocket.send_bytes(audio_chunk)
                            # The first trustworthy proof that the examiner was
                            # actually HEARD. Recorded on the shared session state
                            # so a reload, a remount or a reconnect all consult the
                            # same fact instead of re-deciding it.
                            owner.session_state.opening_delivered = True
                            greeted = True
                except Exception as audio_exc:
                    # Never let one bad PCM frame kill the whole receive loop —
                    # that was a silent "AI voice not coming" mode.
                    logger.warning(
                        "audio forward failed: %s",
                        audio_exc,
                        extra={"session_id": session_id, "event": "audio_forward_error"},
                    )
                # Keep the newest resumption handle so a dropped connection can
                # pick the conversation up exactly where it left off.
                sru = getattr(response, "session_resumption_update", None)
                if sru is not None and getattr(sru, "resumable", None) and getattr(sru, "new_handle", None):
                    resume_handle = sru.new_handle
                go_away = getattr(response, "go_away", None)
                if go_away is not None:
                    logger.info(
                        "gemini go_away received; connection will recycle",
                        extra={
                            "session_id": session_id,
                            "event": "live_go_away",
                            "time_left": str(getattr(go_away, "time_left", "")),
                        },
                    )
                sc = getattr(response, "server_content", None)
                if sc:
                    it = getattr(sc, "input_transcription", None)
                    if it and getattr(it, "text", None):
                        # The student is talking, so the session is plainly not
                        # over — whatever the examiner's last turn looked like.
                        cancel_closing()
                        persist.on_user_text(it.text)
                        turn.add(it.text)
                        await websocket.send_json({"type": "user_transcript", "text": it.text})
                    ot = getattr(sc, "output_transcription", None)
                    if ot and getattr(ot, "text", None):
                        # The examiner replying means the student's turn is over —
                        # the first moment a complete answer exists to assess.
                        if turn.text:
                            # Consumed once, here, and handed to each consumer
                            # explicitly. Three things want this turn and they must
                            # all see the same one.
                            answered, spoken_for, focus_lost = turn.take()
                            # Deterministic, so it can run inline — no network call
                            # to wait on.
                            await _observe_delivery(
                                text=answered, seconds=spoken_for, persist=persist,
                                websocket=websocket, session_id=session_id,
                                language=language,
                            )
                            await _check_turn_integrity(
                                text=answered, seconds=spoken_for, focus_lost=focus_lost,
                                websocket=websocket, persist=persist,
                                session_id=session_id, mode=mode, state=integrity_state,
                            )
                            # Grading is detached: the examiner is already speaking
                            # its next line and must not wait on a scoring call.
                            spawn_grading(answered)
                        persist.on_ai_text(ot.text)
                        await websocket.send_json({"type": "ai_transcript", "text": ot.text})
                    if getattr(sc, "interrupted", None):
                        await websocket.send_json({"type": "interrupted"})
                    if getattr(sc, "turn_complete", None):
                        # The examiner's turn is finished, so it can now be judged
                        # as a question or as a closing remark.
                        note_examiner_turn(last_examiner_turn(persist.transcript))
                        await _forward_turn_complete(
                            websocket, first_turn_done, open_gate=not client_owns_mic_gate
                        )
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
                        args = dict(fc.args or {})
                        event = persist.on_tool(fc.name, args)
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

    async def send_greeting(session, *, already_greeted: bool = False) -> None:
        # Live models stay silent until they receive a turn, so a short trigger
        # is needed to make them speak first. WHICH trigger depends on whether
        # this session has ever greeted:
        #
        #   - never greeted -> the real opening trigger (hello + first question).
        #   - already greeted, but this Gemini connection is FRESH (we lost the
        #     resumption handle, so the model has no history) -> a resume trigger
        #     that restarts the questioning WITHOUT a second hello. Sending the
        #     opening trigger here is the double greeting; sending nothing leaves
        #     the examiner mute for the rest of the exam.
        try:
            trigger = (
                live_service.resume_trigger(mode, language)
                if already_greeted
                else live_service.greeting_trigger(mode, language, scenario)
            )
            await session.send_client_content(
                turns=types.Content(role="user", parts=[types.Part(text=trigger)]),
                turn_complete=True,
            )
            logger.info(
                "resume trigger sent" if already_greeted else "greeting trigger sent",
                extra={
                    "session_id": session_id,
                    "mode": mode,
                    "event": "resume_trigger" if already_greeted else "greeting_trigger",
                },
            )
        except Exception as exc:
            logger.exception("greeting trigger failed session_id=%s", session_id)
            try:
                await websocket.send_json(
                    {"type": "error", "message": f"Could not start the examiner voice: {exc}"}
                )
            except Exception:
                pass

    async def run_gemini_connection() -> str:
        """Run ONE Gemini connection until something ends it.

        Returns the reason it stopped. Raises whatever the transport raised so
        the supervisor can decide between reconnecting and giving up — the old
        code printed that exception and silently walked into finalize(), which
        is how a routine connection recycle became "your session ended".
        """
        nonlocal ready_sent, greeted
        # Do not open a connection the student has already finished with. Opening
        # one takes seconds against a struggling service, and every one of those
        # seconds is spent ignoring their End.
        if end_requested.is_set():
            return "ended"
        if browser_gone.is_set():
            return "browser_gone"
        # `fresh` = this Gemini connection carries NO conversation history.
        # It is NOT the same question as "has this session greeted yet": the
        # resumption handle only arrives some seconds INTO the session, so a drop
        # during the opening leaves us reconnecting fresh on an already-greeted
        # session. Deciding the greeting from `fresh` alone is what spoke the
        # opening twice, so the two facts are now tracked separately.
        fresh = resume_handle is None
        async with live_service.connect_with_fallback(make_config(resume_handle)) as session:
            if not ready_sent:
                # The budget travels with `ready` so the countdown the student
                # sees is the same number the server will enforce, rather than
                # the client guessing from its own config.
                await websocket.send_json(
                    {
                        "type": "ready",
                        "duration_seconds": budget_minutes * 60 if budget_minutes else None,
                    }
                )
                ready_sent = True
            else:
                # A reconnect landed: tell the client to drop the
                # "reconnecting" banner and go back to live.
                await websocket.send_json({"type": "reconnected", "resumed": not fresh})
            if fresh:
                # A history-less connection needs a turn from us or the model stays
                # mute — but WHICH turn depends on whether the student has actually
                # heard the examiner yet, not on whether we once sent a trigger.
                #
                # `greeted` used to be set the moment a trigger was accepted. When
                # the AI service refused or died before producing any audio, that
                # marked the session greeted on the strength of a trigger nobody
                # heard: the retry then came up under "you have already introduced
                # yourself, just continue", and a blind model forbidden to greet
                # said nothing at all until the student spoke first. That is the
                # silent examiner. It is now driven by delivered audio.
                if greeted:
                    # The opening WAS heard, so do not speak another one. Release
                    # the mic gates instead and let the student's next turn resume
                    # the conversation — the alternative, an autonomous nudge, is
                    # what turns repeated 1008 retries into repeated questions.
                    await _forward_turn_complete(
                        websocket, first_turn_done, open_gate=not client_owns_mic_gate
                    )
                else:
                    # Nothing has been heard yet, so this is still the one
                    # legitimate opening attempt.
                    await send_greeting(session, already_greeted=False)

            recv_task = asyncio.create_task(gemini_to_client(session))
            pump_task = asyncio.create_task(pump_to_gemini(session))
            end_task = asyncio.create_task(end_requested.wait())
            gone_task = asyncio.create_task(browser_gone.wait())
            super_task = asyncio.create_task(owner.superseded.wait())
            watched = {recv_task, pump_task, end_task, gone_task, super_task}
            try:
                done, _ = await asyncio.wait(watched, return_when=asyncio.FIRST_COMPLETED)
            finally:
                for task in watched:
                    if not task.done():
                        task.cancel()
                await asyncio.gather(*watched, return_exceptions=True)

            # Surface a real transport failure instead of swallowing it.
            for task in (recv_task, pump_task):
                if task in done and not task.cancelled() and task.exception() is not None:
                    raise task.exception()  # type: ignore[misc]

            if owner.superseded.is_set():
                return "superseded"
            if end_requested.is_set():
                return "ended"
            if browser_gone.is_set():
                return "browser_gone"
            # The receive loop returned cleanly — the model closed the
            # conversation itself.
            return "ended"

    async def _wait_unless_stopped(delay: float) -> bool:
        """Wait `delay` seconds, or return early if the student is done.

        Returns True when we should stop retrying entirely — the student ended the
        session, or their browser left. Reconnect backoff must never outlive the
        student's own decision to stop.
        """
        if end_requested.is_set() or browser_gone.is_set():
            return True
        waiters = [
            asyncio.create_task(end_requested.wait()),
            asyncio.create_task(browser_gone.wait()),
        ]
        try:
            await asyncio.wait(waiters, timeout=delay, return_when=asyncio.FIRST_COMPLETED)
        finally:
            for task in waiters:
                if not task.done():
                    task.cancel()
            await asyncio.gather(*waiters, return_exceptions=True)
        return end_requested.is_set() or browser_gone.is_set()

    async def session_clock():
        """Hold the session to the length the student chose.

        This has to live on the server. The model's own sense of elapsed time is
        unreliable — it will run a "5 minute" viva for fifteen — and the browser
        cannot be trusted to stop anything, because the student can close the tab
        while the Gemini connection stays open and billable.

        Two stages, so the ending sounds deliberate:
          1. At the limit, ask the examiner to close (`wrap_up_trigger`) and tell
             the browser so the UI can show it.
          2. If it is still talking `_OVERRUN_GRACE_SECONDS` later, end the
             session ourselves through the normal path, so the report is still
             written from the real transcript.
        """
        if budget_minutes <= 0:
            return  # no limit configured — nothing to enforce
        await asyncio.sleep(budget_minutes * 60)
        if end_requested.is_set() or browser_gone.is_set():
            return
        logger.info(
            "session time limit reached — asking the examiner to wrap up",
            extra={
                "session_id": session_id,
                "mode": mode,
                "event": "live_time_limit",
                "duration_ms": budget_minutes * 60_000,
            },
        )
        try:
            await websocket.send_json({"type": "time_up", "grace_seconds": _OVERRUN_GRACE_SECONDS})
        except Exception:  # noqa: BLE001 — the socket may already be closing
            pass
        enqueue(("text", live_service.wrap_up_trigger(language)))

        await asyncio.sleep(_OVERRUN_GRACE_SECONDS)
        if end_requested.is_set() or browser_gone.is_set():
            return
        # The nudge was ignored. End it ourselves rather than let it run on.
        logger.warning(
            "examiner did not close after the time limit — ending server-side",
            extra={
                "session_id": session_id,
                "mode": mode,
                "event": "live_time_limit_forced",
                "reason": "wrap_up_ignored",
            },
        )
        end_requested.set()

    async def mic_gate_safety():
        # Never let a missing turn_complete / mic_open keep the mic gated forever.
        # Wait LONGER than the client's own ceiling when the client owns the gate,
        # so this net can only ever catch a client that failed to report — never
        # pre-empt one that is still legitimately playing the greeting.
        await asyncio.sleep(
            _MIC_GATE_SAFETY_SECONDS_CLIENT_GATED
            if client_owns_mic_gate
            else _MIC_GATE_SAFETY_SECONDS
        )
        if not first_turn_done.is_set():
            logger.warning(
                "mic gate safety release fired (no turn_complete)",
                extra={"session_id": session_id, "mode": mode, "event": "mic_gate_safety"},
            )
            first_turn_done.set()

    reader_task = asyncio.create_task(browser_reader())
    safety_task = asyncio.create_task(mic_gate_safety())
    clock_task = asyncio.create_task(session_clock())
    stop_reason = "ended"
    try:
        while True:
            try:
                stop_reason = await run_gemini_connection()
            except WebSocketDisconnect:
                stop_reason = "browser_gone"
                browser_gone.set()
            except Exception as exc:  # noqa: BLE001 — classified immediately below
                if owner.superseded.is_set():
                    stop_reason = "superseded"
                    break
                if browser_gone.is_set():
                    stop_reason = "browser_gone"
                    break
                if not (is_recoverable_live_error(exc) and reconnects < MAX_GEMINI_RECONNECTS):
                    stop_reason = "failed"
                    errored = True
                    fatal_message = _fatal_live_message(exc)
                    fatal_retryable = _fatal_live_retryable(exc)
                    logger.exception("live session failed session_id=%s", session_id)
                    break
                reconnects += 1
                # A reconnect WITH a handle resumes the conversation and is
                # routine. Without one the model comes up blind, which is the
                # situation that produced a second greeting — so that case is
                # logged loudly enough for the diagnostics sink (WARNING+) to
                # keep it. Diagnosing this cost a session because it only ever
                # existed as an INFO line the sink discarded.
                resumable = resume_handle is not None
                (logger.info if resumable else logger.warning)(
                    "reconnecting live session",
                    extra={
                        "session_id": session_id,
                        "mode": mode,
                        "event": "live_reconnect" if resumable else "live_reconnect_blind",
                        "attempt": reconnects,
                        "resumable": resumable,
                        "reason": type(exc).__name__,
                    },
                )
                try:
                    await websocket.send_json({"type": "reconnecting", "attempt": reconnects})
                except Exception:
                    stop_reason = "browser_gone"
                    browser_gone.set()
                    break
                # An INTERRUPTIBLE wait. This was a plain sleep, and the backoff
                # schedule runs 0.5s, 1, 2, 4, 5, 5 — so a student who pressed
                # "End & report" while the AI service was refusing connections
                # waited up to twenty seconds of accumulated sleep, plus the
                # failing connect attempts between them, before anything looked
                # at their request. From their side the End button simply did
                # nothing.
                if await _wait_unless_stopped(_reconnect_delay(reconnects)):
                    stop_reason = "ended" if end_requested.is_set() else "browser_gone"
                    break
                continue
            break
    finally:
        for task in (reader_task, safety_task, clock_task):
            if not task.done():
                task.cancel()
        await asyncio.gather(reader_task, safety_task, clock_task, return_exceptions=True)
        # Live gradings are for the panel of a session that is now over. Waiting on
        # one would delay the report behind a call that no longer has anywhere to
        # send its result, and finalize re-grades the whole transcript regardless.
        for task in list(grading_tasks):
            if not task.done():
                task.cancel()
        if grading_tasks:
            await asyncio.gather(*grading_tasks, return_exceptions=True)
        cancel_closing()
    logger.info(
        "live session stopped",
        extra={
            "session_id": session_id,
            "mode": mode,
            "event": "live_ws_stop",
            "reason": stop_reason,
            "reconnects": reconnects,
            "has_activity": persist.has_activity,
        },
    )

    # A superseded connection lost this session to a newer socket. It must not
    # finalize and must not revert — either would stomp on the connection that
    # is actually running the student's exam right now.
    if owner.superseded.is_set():
        logger.info(
            "superseded live connection exiting without finalize",
            extra={"session_id": session_id, "event": "live_ws_superseded_exit"},
        )
        await release_live_owner(session_id, owner)
        return

    # Never fake a completed 0% session: with nothing the student actually said,
    # put the row back to Pending so they can retry, rather than grading silence.
    if not should_finalize(superseded=False, has_activity=persist.has_activity):
        await asyncio.to_thread(persist.revert_status)
        # Ending before answering is a normal thing to do, and it was being
        # reported as a failure. The student pressed "End & report", got the error
        # UI, and stayed stuck on the live screen — so the button looked broken
        # while the session sat there unfinished. A genuine engine failure still
        # sends `error`; a deliberate end with nothing recorded now sends
        # `aborted`, which the client treats as terminal but not as a fault.
        try:
            if errored and fatal_message:
                await websocket.send_json({
                    "type": "error",
                    "message": fatal_message,
                    "retryable": fatal_retryable,
                })
            else:
                await websocket.send_json({
                    "type": "aborted",
                    "reason": "no_answers",
                    "message": (
                        "You ended before answering anything, so there was nothing to record "
                        "and no report to build. This session is still available whenever you "
                        "want to sit it."
                    ),
                })
            await websocket.close()
        except Exception:
            pass
        await release_live_owner(session_id, owner)
        return

    # The student genuinely spoke, so they get their report — even if the
    # transport died late in the session. Throwing away a real conversation
    # because the connection dropped at the end is the worse failure.
    try:
        await websocket.send_json({"type": "finalizing"})
    except Exception:
        pass
    summary = await asyncio.to_thread(persist.finalize)
    try:
        # `ended_early` rides inside the summary so every existing report
        # consumer receives it without a signature change.
        await websocket.send_json({
            "type": "ended",
            "summary": {**summary, **({"ended_early": True} if errored else {})},
        })
        await websocket.close()
    except Exception:
        pass
    await release_live_owner(session_id, owner)
