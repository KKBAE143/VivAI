"""End-to-end coverage of the live WebSocket bridge's reconnect supervisor.

This drives the real `live_ws` handler against a fake browser socket and a fake
Gemini session, because the failure it guards is a silent one: before the fix, a
Gemini connection ending (which the Live API does routinely — every ~10 minutes,
and after only 2 minutes for video sessions) raised out of the receive loop, got
printed, and the handler walked straight into finalize as if the student had
simply finished.
"""
from __future__ import annotations

import asyncio
import contextlib
import json
from types import SimpleNamespace

import pytest
from google.genai import errors as genai_errors

from api import live as live_api


# --------------------------------------------------------------------------- #
# Fakes
# --------------------------------------------------------------------------- #
class FakeBrowserSocket:
    """Minimal Starlette-WebSocket surface used by the live handler."""

    def __init__(self, script: list[dict] | None = None):
        # Messages the "browser" sends, in order. After they run out the socket
        # blocks (a real student sitting quietly), until `disconnect()`.
        self._incoming = asyncio.Queue()
        for msg in script or []:
            self._incoming.put_nowait(msg)
        self.sent: list[dict] = []
        self.sent_bytes: list[bytes] = []
        self.closed_with: int | None = None
        self.query_params: dict[str, str] = {}

    # -- server -> browser -------------------------------------------------- #
    async def accept(self) -> None:
        return None

    async def send_json(self, payload: dict) -> None:
        if self.closed_with is not None:
            raise RuntimeError("socket closed")
        self.sent.append(payload)

    async def send_bytes(self, data: bytes) -> None:
        self.sent_bytes.append(data)

    async def close(self, code: int = 1000) -> None:
        self.closed_with = code
        await self._incoming.put({"type": "websocket.disconnect"})

    # -- browser -> server -------------------------------------------------- #
    async def receive(self) -> dict:
        return await self._incoming.get()

    def push(self, msg: dict) -> None:
        self._incoming.put_nowait(msg)

    def types_sent(self) -> list[str]:
        return [m.get("type") for m in self.sent]


class FakeGeminiSession:
    """One Gemini connection. `turns` is a list of lists of fake responses."""

    def __init__(self, turns: list[list], fail_with: BaseException | None = None):
        self._turns = list(turns)
        self._fail_with = fail_with
        self.client_content: list[str] = []
        self.audio_sent: list[bytes] = []
        self.tool_responses: list = []

    async def send_client_content(self, turns=None, turn_complete=True) -> None:
        text = "".join(p.text for p in turns.parts)
        self.client_content.append(text)

    async def send_realtime_input(self, **kwargs) -> None:
        blob = kwargs.get("audio") or kwargs.get("media")
        if blob is not None:
            self.audio_sent.append(blob.data)

    async def send_tool_response(self, function_responses=None) -> None:
        self.tool_responses.append(function_responses)

    async def receive(self):
        if self._turns:
            for response in self._turns.pop(0):
                yield response
            return
        # Out of scripted turns: this connection ends the way the Live API ends
        # one — by raising, never by yielding nothing.
        if self._fail_with is not None:
            raise self._fail_with
        await asyncio.Event().wait()  # stay open


def _server_content(**kwargs):
    defaults = {
        "input_transcription": None,
        "output_transcription": None,
        "interrupted": None,
        "turn_complete": None,
        "model_turn": None,
    }
    return SimpleNamespace(**{**defaults, **kwargs})


def _response(server_content=None, tool_call=None, resumption_handle=None, data=None):
    return SimpleNamespace(
        data=data,
        server_content=server_content,
        tool_call=tool_call,
        go_away=None,
        session_resumption_update=(
            SimpleNamespace(resumable=True, new_handle=resumption_handle)
            if resumption_handle
            else None
        ),
    )


def _text(text: str):
    return SimpleNamespace(text=text)


# --------------------------------------------------------------------------- #
# Harness
# --------------------------------------------------------------------------- #
@pytest.fixture
def live_harness(monkeypatch, fake_supabase):
    """Patch out auth, Supabase and Gemini; capture each config we connect with."""
    live_api._active_live_owners.clear()
    fake_supabase.preload("viva_sessions", [{"id": "s1", "profile_id": "u1", "persona": "balanced",
                                             "language": "English", "subject": "DBMS",
                                             "session_type": "Subject", "context": {}}])
    fake_supabase.preload("viva_questions", [])
    monkeypatch.setattr(live_api, "get_supabase", lambda: fake_supabase)
    monkeypatch.setattr(live_api, "user_from_token", lambda t: {"id": "u1", "name": "Asha"})
    monkeypatch.setattr(live_api, "_project_context", lambda pid: "")
    monkeypatch.setattr(live_api, "log_activity", lambda *a, **k: None)
    monkeypatch.setattr(live_api.gamification_service, "award_xp", lambda *a, **k: None)

    state = SimpleNamespace(sessions=[], configs=[])

    def install(sessions: list[FakeGeminiSession]):
        state.sessions = list(sessions)
        pending = list(sessions)

        @contextlib.asynccontextmanager
        async def fake_connect(config):
            state.configs.append(config)
            if not pending:
                raise AssertionError("connected more times than the test scripted")
            yield pending.pop(0)

        monkeypatch.setattr(live_api.live_service, "connect_with_fallback", fake_connect)
        return state

    yield install
    live_api._active_live_owners.clear()


async def _run(socket: FakeBrowserSocket, timeout: float = 5.0):
    await asyncio.wait_for(live_api.live_ws(socket, "viva", "s1"), timeout=timeout)


# --------------------------------------------------------------------------- #
# Tests
# --------------------------------------------------------------------------- #
def test_connection_recycle_resumes_instead_of_ending_the_session(live_harness, monkeypatch):
    """The core of Bugs 2/3/4: Gemini ending a connection must NOT end the exam."""
    monkeypatch.setattr(live_api, "_reconnect_delay", lambda attempt: 0.0)

    first = FakeGeminiSession(
        turns=[[
            _response(
                _server_content(output_transcription=_text("Hello Asha, first question?"),
                                turn_complete=True),
                resumption_handle="handle-1",
            ),
            _response(_server_content(input_transcription=_text("It is a database project."))),
        ]],
        # …then the connection recycles, exactly as the Live API does.
        fail_with=genai_errors.APIError(1011, {"message": "connection closed"}, None),
    )
    end_call = SimpleNamespace(id="c1", name="end_session", args={})
    second = FakeGeminiSession(turns=[[
        _response(_server_content(output_transcription=_text("Thanks, that's everything."))),
        _response(tool_call=SimpleNamespace(function_calls=[end_call])),
    ]])
    install = live_harness
    state = install([first, second])

    socket = FakeBrowserSocket()
    socket.query_params = {"token": "t", "pv": "1"}
    monkeypatch.setattr(live_api.live_service, "analyze_transcript",
                        lambda *a, **k: {"questions": [], "overall_score": 72,
                                         "summary": "ok", "strengths": [], "weaknesses": []})
    monkeypatch.setattr(live_api.report_service, "build_report", lambda **k: None)

    asyncio.run(_run(socket))

    types_sent = socket.types_sent()
    assert "reconnecting" in types_sent, "a recycled connection must reconnect, not end"
    assert "reconnected" in types_sent
    # The session was finalized normally, with the student's words intact.
    assert "ended" in types_sent
    ended = next(m for m in socket.sent if m["type"] == "ended")
    assert ended["summary"]["overall_score"] == 72
    assert not ended["summary"].get("ended_early")


def test_the_greeting_is_sent_once_across_a_reconnect(live_harness, monkeypatch):
    """Bug 1: a resumed connection already has the history — re-triggering the
    opening is literally a second greeting."""
    monkeypatch.setattr(live_api, "_reconnect_delay", lambda attempt: 0.0)

    first = FakeGeminiSession(
        turns=[[
            _response(_server_content(output_transcription=_text("Hello Asha."), turn_complete=True),
                      resumption_handle="handle-1"),
            _response(_server_content(input_transcription=_text("Yes, ready."))),
        ]],
        fail_with=genai_errors.APIError(1011, {"message": "closed"}, None),
    )
    end_call = SimpleNamespace(id="c1", name="end_session", args={})
    second = FakeGeminiSession(turns=[[_response(tool_call=SimpleNamespace(function_calls=[end_call]))]])
    state = live_harness([first, second])

    socket = FakeBrowserSocket()
    socket.query_params = {"token": "t", "pv": "1"}
    monkeypatch.setattr(live_api.live_service, "analyze_transcript",
                        lambda *a, **k: {"questions": [], "overall_score": 50, "summary": "",
                                         "strengths": [], "weaknesses": []})
    monkeypatch.setattr(live_api.report_service, "build_report", lambda **k: None)

    asyncio.run(_run(socket))

    assert len(first.client_content) == 1, "the first connection greets exactly once"
    assert second.client_content == [], "a RESUMED connection must never greet again"
    # …and it resumed with the handle the server handed us, rather than
    # starting a fresh session that would have lost the conversation.
    assert state.configs[0].session_resumption.handle is None
    assert state.configs[1].session_resumption.handle == "handle-1"


def test_a_silent_session_is_reverted_rather_than_graded(live_harness, monkeypatch):
    """Bug 4's honest case: the student genuinely never spoke."""
    end_call = SimpleNamespace(id="c1", name="end_session", args={})
    only = FakeGeminiSession(turns=[[
        _response(_server_content(output_transcription=_text("Hello?"), turn_complete=True)),
        _response(tool_call=SimpleNamespace(function_calls=[end_call])),
    ]])
    live_harness([only])

    socket = FakeBrowserSocket()
    socket.query_params = {"token": "t", "pv": "1"}
    asyncio.run(_run(socket))

    assert "ended" not in socket.types_sent()
    # This is announced as `aborted` rather than `error` now — nothing was
    # recorded, but nothing failed either. See
    # test_ending_before_answering_is_reported_as_aborted_not_as_an_error.
    aborted = next(m for m in socket.sent if m["type"] == "aborted")
    assert "nothing to record" in aborted["message"]
    # The row went back to Pending so the student can retry.
    updates = [c for c in fake_updates(live_api.get_supabase(), "viva_sessions")]
    assert {"status": "Pending"} in updates


def test_a_real_conversation_still_reports_when_the_engine_dies(live_harness, monkeypatch):
    """A drop after the student spoke must still produce their report."""
    monkeypatch.setattr(live_api, "_reconnect_delay", lambda attempt: 0.0)
    monkeypatch.setattr(live_api, "MAX_GEMINI_RECONNECTS", 0)

    only = FakeGeminiSession(
        turns=[[
            _response(_server_content(output_transcription=_text("Hello Asha, question one?"),
                                      turn_complete=True)),
            _response(_server_content(input_transcription=_text("Indexes speed up lookups."))),
        ]],
        fail_with=genai_errors.APIError(1011, {"message": "closed"}, None),
    )
    live_harness([only])

    socket = FakeBrowserSocket()
    socket.query_params = {"token": "t", "pv": "1"}
    monkeypatch.setattr(live_api.live_service, "analyze_transcript",
                        lambda *a, **k: {"questions": [], "overall_score": 64, "summary": "s",
                                         "strengths": [], "weaknesses": []})
    monkeypatch.setattr(live_api.report_service, "build_report", lambda **k: None)

    asyncio.run(_run(socket))

    ended = next(m for m in socket.sent if m["type"] == "ended")
    assert ended["summary"]["overall_score"] == 64
    assert ended["summary"]["ended_early"] is True, "the student must be told it was cut short"


def test_mic_audio_is_gated_until_the_client_says_playback_drained(live_harness, monkeypatch):
    """The server must not accept mic audio on `turn_complete` for pv>=1 clients —
    the browser is still playing the greeting out loud at that point."""
    end_call = SimpleNamespace(id="c1", name="end_session", args={})
    only = FakeGeminiSession(turns=[
        [_response(_server_content(output_transcription=_text("Hello."), turn_complete=True))],
        [_response(_server_content(input_transcription=_text("Hi."))),
         _response(tool_call=SimpleNamespace(function_calls=[end_call]))],
    ])
    live_harness([only])

    socket = FakeBrowserSocket()
    socket.query_params = {"token": "t", "pv": "1"}
    # Audio that arrives before the client opens its gate must be dropped…
    socket.push({"type": "websocket.receive", "bytes": b"\x01\x02"})
    socket.push({"type": "websocket.receive", "text": json.dumps({"type": "mic_open"})})
    # …and audio after it must get through.
    socket.push({"type": "websocket.receive", "bytes": b"\x03\x04"})

    monkeypatch.setattr(live_api.live_service, "analyze_transcript",
                        lambda *a, **k: {"questions": [], "overall_score": 10, "summary": "",
                                         "strengths": [], "weaknesses": []})
    monkeypatch.setattr(live_api.report_service, "build_report", lambda **k: None)
    asyncio.run(_run(socket))

    assert b"\x01\x02" not in only.audio_sent, "pre-gate audio leaked to Gemini"
    assert b"\x03\x04" in only.audio_sent, "post-gate audio must reach Gemini"


def fake_updates(sb, table_name: str) -> list[dict]:
    """Every dict passed to `.update(...)` on a FakeTable."""
    table = sb.tables.get(table_name)
    if table is None:
        return []
    return [call[1][0] for call in table.calls if call[0] == "update" and call[1]]


def test_a_history_less_reconnect_does_not_greet_again_once_audio_was_heard(
    live_harness, monkeypatch
):
    """The double greeting: the resumption handle only arrives SECONDS into the
    session, so a drop during the opening reconnects with `resume_handle is None`.

    The old code inferred "should I greet?" from that handle alone and spoke the
    full opening a second time. What settles it is whether the student actually
    HEARD the examiner — so the first connection here delivers real audio.
    """
    monkeypatch.setattr(live_api, "_reconnect_delay", lambda attempt: 0.0)

    # Greets AUDIBLY, then dies before any session_resumption_update.
    first = FakeGeminiSession(
        turns=[[
            _response(data=b"\x01\x02"),
            _response(_server_content(output_transcription=_text("Hello Asha, I'm your examiner."),
                                      turn_complete=True)),
            _response(_server_content(input_transcription=_text("Hi, I'm ready."))),
        ]],
        fail_with=genai_errors.APIError(1011, {"message": "closed"}, None),
    )
    end_call = SimpleNamespace(id="c1", name="end_session", args={})
    second = FakeGeminiSession(turns=[[_response(tool_call=SimpleNamespace(function_calls=[end_call]))]])
    state = live_harness([first, second])

    socket = FakeBrowserSocket()
    socket.query_params = {"token": "t", "pv": "1"}
    monkeypatch.setattr(live_api.live_service, "analyze_transcript",
                        lambda *a, **k: {"questions": [], "overall_score": 50, "summary": "",
                                         "strengths": [], "weaknesses": []})
    monkeypatch.setattr(live_api.report_service, "build_report", lambda **k: None)

    asyncio.run(_run(socket))

    assert len(first.client_content) == 1, "the first connection greets exactly once"
    # It reconnected with no handle to resume from, so it IS a fresh connection…
    assert state.configs[1].session_resumption.handle is None
    # …and because the opening was heard, it must NOT be prompted to speak again.
    # The student's next turn resumes the conversation instead; an autonomous nudge
    # here is what turned repeated retries into repeated spoken questions.
    assert second.client_content == [], "an already-heard opening must not be re-triggered"
    # The client is told the turn is over so its mic gate opens and the student can
    # carry on — otherwise the viva stalls in silence.
    assert "turn_complete" in socket.types_sent()


def test_a_trigger_nobody_heard_does_not_count_as_greeted(live_harness, monkeypatch):
    """The silent examiner, and the regression that caused it.

    `greeted` used to be set the moment the greeting trigger was accepted. When
    the AI service refused or died before producing any audio — the observed 1008 —
    that marked the session greeted on the strength of a trigger nobody heard. The
    retry then came up under "you have already introduced yourself, just continue",
    and a blind model forbidden to greet said nothing at all until the student
    spoke first. No voice, no question, and then feedback the moment they talked.

    A trigger is not a greeting. Only delivered audio is.
    """
    monkeypatch.setattr(live_api, "_reconnect_delay", lambda attempt: 0.0)

    # Accepts the trigger, produces NO audio, then dies.
    silent = FakeGeminiSession(
        turns=[[]],
        fail_with=genai_errors.APIError(1008, {"message": "aborted"}, None),
    )
    end_call = SimpleNamespace(id="c1", name="end_session", args={})
    second = FakeGeminiSession(turns=[[
        _response(data=b"\x01"),
        _response(tool_call=SimpleNamespace(function_calls=[end_call])),
    ]])
    state = live_harness([silent, second])

    socket = FakeBrowserSocket()
    socket.query_params = {"token": "t", "pv": "1"}
    monkeypatch.setattr(live_api.live_service, "analyze_transcript",
                        lambda *a, **k: {"questions": [], "overall_score": 50, "summary": "",
                                         "strengths": [], "weaknesses": []})
    monkeypatch.setattr(live_api.report_service, "build_report", lambda **k: None)

    asyncio.run(_run(socket))

    # The retry must deliver a REAL opening, not a silent continuation.
    assert len(second.client_content) == 1, "nothing was heard, so it must still greet"
    assert "hello" in second.client_content[0].lower()
    # And its instructions must not forbid the greeting it has been asked for.
    assert "ALREADY GREETED" not in str(state.configs[1].system_instruction)


def test_a_reconnected_examiner_is_never_told_to_greet(live_harness, monkeypatch):
    """The double greeting came BACK, from the other half of the same problem.

    Stopping the server from re-sending the greeting trigger was not enough. On a
    history-less reconnect the model comes up blind, and its SYSTEM INSTRUCTION
    still ordered it to open the session with a hello — while a user turn asked it
    not to. Faced with an empty history and two contradictory instructions it did
    what the system prompt said, and greeted a second time in its own words.

    A user turn cannot reliably override a system instruction, so the instruction
    is what has to change. The second connection must be built with no greeting
    order in it at all.
    """
    monkeypatch.setattr(live_api, "_reconnect_delay", lambda attempt: 0.0)

    first = FakeGeminiSession(
        turns=[[
            # Audible: this is what makes the session "already greeted".
            _response(data=b"\x01\x02"),
            _response(_server_content(output_transcription=_text("Namaskaram, I'm your examiner."),
                                      turn_complete=True)),
        ]],
        fail_with=genai_errors.APIError(1011, {"message": "closed"}, None),
    )
    end_call = SimpleNamespace(id="c1", name="end_session", args={})
    second = FakeGeminiSession(turns=[[_response(tool_call=SimpleNamespace(function_calls=[end_call]))]])
    state = live_harness([first, second])

    socket = FakeBrowserSocket()
    socket.query_params = {"token": "t", "pv": "1"}
    monkeypatch.setattr(live_api.live_service, "analyze_transcript",
                        lambda *a, **k: {"questions": [], "overall_score": 50, "summary": "",
                                         "strengths": [], "weaknesses": []})
    monkeypatch.setattr(live_api.report_service, "build_report", lambda **k: None)

    asyncio.run(_run(socket))

    opening_instruction = state.configs[0].system_instruction
    resumed_instruction = state.configs[1].system_instruction

    # The first connection is the one that greets, and is told so.
    assert "GREETING (single source of truth)" in str(opening_instruction)

    # The second one is told the opposite, in the same place.
    resumed = str(resumed_instruction)
    assert "ALREADY GREETED — DO NOT GREET" in resumed
    assert "GREETING (single source of truth)" not in resumed
    # And the playbook's own OPENING step is cancelled, so the two halves of the
    # prompt cannot disagree with each other.
    assert "RECONNECT OVERRIDE" in resumed
    assert "Your next turn is a question" in resumed


def test_the_first_connection_is_still_told_to_greet(live_harness, monkeypatch):
    """Guards the other direction: suppressing the greeting on connection ONE would
    leave the examiner silent at the start of every session, which is worse than
    greeting twice."""
    end_call = SimpleNamespace(id="c1", name="end_session", args={})
    only = FakeGeminiSession(turns=[[_response(tool_call=SimpleNamespace(function_calls=[end_call]))]])
    state = live_harness([only])

    socket = FakeBrowserSocket()
    socket.query_params = {"token": "t", "pv": "1"}
    monkeypatch.setattr(live_api.live_service, "analyze_transcript",
                        lambda *a, **k: {"questions": [], "overall_score": 50, "summary": "",
                                         "strengths": [], "weaknesses": []})
    monkeypatch.setattr(live_api.report_service, "build_report", lambda **k: None)

    asyncio.run(_run(socket))

    instruction = str(state.configs[0].system_instruction)
    assert "GREETING (single source of truth)" in instruction
    assert "ALREADY GREETED" not in instruction


def test_ending_before_answering_is_reported_as_aborted_not_as_an_error(live_harness, monkeypatch):
    """Pressing "End & report" with nothing answered looked like a broken button.

    Nothing was recorded, so the server correctly refuses to fabricate a completed
    0% session and reverts the row to Pending — but it announced that as
    `{"type": "error"}`. The client renders errors as a failure with a Retry
    button and stays on the live screen, so from the student's side the session
    would not end and something had apparently gone wrong.

    It is a normal outcome, and it now has its own terminal message.
    """
    end_call = SimpleNamespace(id="c1", name="end_session", args={})
    only = FakeGeminiSession(
        turns=[[
            _response(_server_content(output_transcription=_text("Namaskaram, first question…"),
                                      turn_complete=True)),
            _response(tool_call=SimpleNamespace(function_calls=[end_call])),
        ]],
    )
    live_harness([only])

    # The examiner greeted; the student never said a word.
    socket = FakeBrowserSocket(script=[{"text": json.dumps({"type": "end"})}])
    socket.query_params = {"token": "t", "pv": "1"}

    finalized: list[bool] = []
    monkeypatch.setattr(live_api.live_service, "analyze_transcript",
                        lambda *a, **k: finalized.append(True) or {})

    asyncio.run(_run(socket))

    kinds = [m.get("type") for m in socket.sent]
    assert "aborted" in kinds, f"expected a terminal aborted message, got {kinds}"
    assert "error" not in kinds, "ending an unanswered session is not a failure"
    assert "ended" not in kinds, "and must not claim a completed session either"

    aborted = next(m for m in socket.sent if m.get("type") == "aborted")
    assert aborted["reason"] == "no_answers"
    # It has to say the session is still usable, or the student assumes it is spent.
    assert "still available" in aborted["message"]
    assert not finalized, "there is nothing to grade, so no report is built"


def test_pressing_end_during_a_reconnect_storm_is_acted_on_immediately(live_harness, monkeypatch):
    """The "End button does nothing" report.

    When the AI service refuses connections (observed in production as a
    WebSocket 1008), the supervisor retries on a backoff of 0.5s, 1, 2, 4, 5, 5.
    That wait was a plain `asyncio.sleep`, so a student pressing "End & report"
    mid-storm waited out the accumulated sleep AND the failing connect attempts
    between them before anything looked at their request — while the UI sat on
    "Preparing your report…". Reconnect backoff must never outlive the student's
    own decision to stop.
    """
    delays: list[float] = []

    def slow_backoff(attempt: int) -> float:
        delays.append(5.0)
        return 5.0  # a long wait, so a plain sleep would blow the test timeout

    monkeypatch.setattr(live_api, "_reconnect_delay", slow_backoff)

    # Every connection attempt fails, so the supervisor keeps retrying.
    always_fails = [
        FakeGeminiSession(turns=[[]], fail_with=genai_errors.APIError(1008, {"message": "aborted"}, None))
        for _ in range(live_api.MAX_GEMINI_RECONNECTS + 1)
    ]
    live_harness(always_fails)

    # The student gives up and ends while the retries are still going.
    socket = FakeBrowserSocket(script=[{"text": json.dumps({"type": "end"})}])
    socket.query_params = {"token": "t", "pv": "1"}

    # 3 seconds is far less than one 5-second backoff, let alone six of them.
    asyncio.run(_run(socket, timeout=3.0))

    assert delays, "the test only means something if a reconnect was attempted"
    kinds = [m.get("type") for m in socket.sent]
    assert "aborted" in kinds or "error" in kinds, f"the end must be answered, got {kinds}"


def test_a_service_refusal_is_not_reported_as_a_missing_api_key():
    """Every fatal live error told the student to check GEMINI_API_KEY and the
    google-genai version — developer advice a student cannot act on, and wrong for
    the failure that actually happens."""
    refused = genai_errors.APIError(1008, {"message": "The operation was aborted."}, None)
    message = live_api._fatal_live_message(refused)
    assert "GEMINI_API_KEY" not in message
    assert "retry" in message.lower()
    assert "nothing you said was lost" in message.lower()


def test_a_quota_failure_says_so():
    exhausted = RuntimeError("429 RESOURCE_EXHAUSTED: quota exceeded")
    assert "usage limit" in live_api._fatal_live_message(exhausted).lower()


def test_a_credential_failure_does_not_blame_the_student():
    bad_key = RuntimeError("401 UNAUTHENTICATED: API key not valid")
    message = live_api._fatal_live_message(bad_key)
    assert "on us" in message.lower()


def test_a_question_logged_without_audio_is_asked_to_be_spoken(live_harness, monkeypatch):
    """"It's generating the transcription but the voice is not coming."

    Native-audio Live models sometimes end a turn having emitted a function call
    and a transcript but NO PCM at all. The question appears as text in the panel
    while the student's speakers stay silent, which reads as a broken examiner even
    though the session is otherwise fine. The prompt now demands speech before
    tools, and this is the server-side net for when that is ignored.
    """
    question = SimpleNamespace(
        id="q1", name="record_question", args={"question": "What is 3NF?", "topic": "DBMS"}
    )
    end_call = SimpleNamespace(id="c2", name="end_session", args={})
    only = FakeGeminiSession(turns=[[
        # A turn with a transcript and a tool call, and no audio whatsoever.
        _response(_server_content(output_transcription=_text("What is 3NF?"))),
        _response(tool_call=SimpleNamespace(function_calls=[question])),
        _response(_server_content(turn_complete=True)),
        _response(tool_call=SimpleNamespace(function_calls=[end_call])),
    ]])
    live_harness([only])

    socket = FakeBrowserSocket()
    socket.query_params = {"token": "t", "pv": "1"}
    monkeypatch.setattr(live_api.live_service, "analyze_transcript",
                        lambda *a, **k: {"questions": [], "overall_score": 50, "summary": "",
                                         "strengths": [], "weaknesses": []})
    monkeypatch.setattr(live_api.report_service, "build_report", lambda **k: None)

    asyncio.run(_run(socket))

    # A recovery turn was sent, naming the question that was already recorded.
    recovery = [c for c in only.client_content if "no audio" in c]
    assert len(recovery) == 1, f"expected one recovery, got {only.client_content}"
    assert "What is 3NF?" in recovery[0]
    # It must not be able to become a duplicate question or a second greeting.
    assert "do NOT call any tool" in recovery[0]
    assert "Do NOT greet" in recovery[0]
    # And the browser is told, so the UI can explain the pause if it wants to.
    assert "speech_recovery" in socket.types_sent()


def test_a_spoken_question_is_never_asked_to_repeat_itself(live_harness, monkeypatch):
    """The guard that keeps this from becoming the duplication bug again: a turn
    that DID produce audio must never be nudged."""
    question = SimpleNamespace(
        id="q1", name="record_question", args={"question": "What is 3NF?", "topic": "DBMS"}
    )
    end_call = SimpleNamespace(id="c2", name="end_session", args={})
    only = FakeGeminiSession(turns=[[
        _response(data=b"\x01\x02"),  # the examiner actually spoke
        _response(_server_content(output_transcription=_text("What is 3NF?"))),
        _response(tool_call=SimpleNamespace(function_calls=[question])),
        _response(_server_content(turn_complete=True)),
        _response(tool_call=SimpleNamespace(function_calls=[end_call])),
    ]])
    live_harness([only])

    socket = FakeBrowserSocket()
    socket.query_params = {"token": "t", "pv": "1"}
    monkeypatch.setattr(live_api.live_service, "analyze_transcript",
                        lambda *a, **k: {"questions": [], "overall_score": 50, "summary": "",
                                         "strengths": [], "weaknesses": []})
    monkeypatch.setattr(live_api.report_service, "build_report", lambda **k: None)

    asyncio.run(_run(socket))

    assert not [c for c in only.client_content if "no audio" in c]
    assert "speech_recovery" not in socket.types_sent()


def test_the_examiner_is_told_to_speak_before_logging():
    """The prompt-side half of the fix. Demanding the tool call in the SAME turn as
    the question is what produced turns containing a function call, a transcript,
    and no speech."""
    prompt = live_api.live_service.build_system_instruction(
        "viva", "balanced", "English", "A DBMS project", subject="DBMS", duration_minutes=10
    )
    assert "AUDIO IS MANDATORY" in prompt
    assert "never replace speech" in prompt
    assert "same turn as the question" not in prompt


def test_the_recovery_is_capped():
    """A model that will not speak at all must not be nudged forever."""
    assert live_api._MAX_AUDIO_RECOVERIES <= 3
