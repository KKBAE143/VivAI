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


def test_a_history_less_reconnect_resumes_without_greeting_again(live_harness, monkeypatch):
    """The double greeting: the resumption handle only arrives SECONDS into the
    session, so a drop during the opening reconnects with `resume_handle is None`.

    The old code inferred "should I greet?" from that handle alone, so this path
    spoke the full opening a second time. It must instead send a resume trigger:
    something (a Live model stays mute without a turn), but never a second hello.
    """
    monkeypatch.setattr(live_api, "_reconnect_delay", lambda attempt: 0.0)

    # Greets, then the connection dies BEFORE any session_resumption_update.
    first = FakeGeminiSession(
        turns=[[
            _response(
                _server_content(
                    output_transcription=_text("Hello Asha, I'm your examiner."),
                    turn_complete=True,
                ),
                data=b"opening-audio",
            ),
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
    # …but the opening already reached the browser. Automatically prompting a
    # blind model here is what produced a fresh spoken opening on every 1008
    # retry. It must listen for the student's next turn instead, and explicitly
    # release the mic gate so that next turn can reach it immediately.
    assert second.client_content == []
    assert socket.types_sent().count("turn_complete") >= 2
    resumed_prompt = str(state.configs[1].system_instruction)
    assert "SESSION CONTINUATION" in resumed_prompt
    assert "1. OPENING" not in resumed_prompt


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
            _response(
                _server_content(
                    output_transcription=_text("Namaskaram, I'm your examiner."),
                    turn_complete=True,
                ),
                data=b"opening-audio",
            ),
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
    # The resumed playbook must be structurally free of the opening step. An
    # appended override leaves two contradictory system-level instructions and
    # Gemini may obey the earlier, concrete command to introduce itself.
    assert "1. OPENING" not in resumed
    assert "RECONNECT OVERRIDE" not in resumed
    assert "SESSION CONTINUATION" in resumed
    assert "FIRST reply only, greet" not in resumed


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

    # The student gives up only after the first refusal entered backoff.
    socket = FakeBrowserSocket()
    socket.query_params = {"token": "t", "pv": "1"}

    async def scenario():
        task = asyncio.create_task(live_api.live_ws(socket, "viva", "s1"))
        for _ in range(100):
            if "reconnecting" in socket.types_sent():
                break
            await asyncio.sleep(0.01)
        assert "reconnecting" in socket.types_sent()
        socket.push({"text": json.dumps({"type": "end"})})
        # One second is far less than one 5-second backoff.
        await asyncio.wait_for(task, timeout=1.0)

    asyncio.run(scenario())

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


def test_end_cancels_a_connection_attempt_that_has_not_opened(live_harness, monkeypatch):
    """End must not wait for a slow Gemini WebSocket handshake."""
    live_harness([])
    entered = asyncio.Event()
    cancelled = asyncio.Event()

    @contextlib.asynccontextmanager
    async def hanging_connect(config):
        entered.set()
        try:
            await asyncio.Event().wait()
        finally:
            cancelled.set()
        yield  # pragma: no cover - cancellation must prevent this

    monkeypatch.setattr(live_api.live_service, "connect_with_fallback", hanging_connect)
    socket = FakeBrowserSocket()
    socket.query_params = {"token": "t", "pv": "1"}

    async def scenario():
        task = asyncio.create_task(live_api.live_ws(socket, "viva", "s1"))
        await asyncio.wait_for(entered.wait(), timeout=1.0)
        socket.push({"text": json.dumps({"type": "end"})})
        await asyncio.wait_for(task, timeout=1.0)

    asyncio.run(scenario())

    assert cancelled.is_set(), "the in-progress Gemini connection was not cancelled"
    assert "aborted" in socket.types_sent()


def test_end_cancels_a_hanging_opening_trigger(live_harness):
    """A connected model whose opening send stalls must still stop immediately."""
    started = asyncio.Event()
    cancelled = asyncio.Event()

    class HangingGreetingSession(FakeGeminiSession):
        async def send_client_content(self, turns=None, turn_complete=True) -> None:
            started.set()
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.set()

    only = HangingGreetingSession(turns=[])
    live_harness([only])
    socket = FakeBrowserSocket()
    socket.query_params = {"token": "t", "pv": "1"}

    async def scenario():
        task = asyncio.create_task(live_api.live_ws(socket, "viva", "s1"))
        await asyncio.wait_for(started.wait(), timeout=1.0)
        socket.push({"text": json.dumps({"type": "end"})})
        await asyncio.wait_for(task, timeout=1.0)

    asyncio.run(scenario())

    assert cancelled.is_set(), "the hanging opening send was not cancelled"
    assert "aborted" in socket.types_sent()


def test_browser_owner_handoff_does_not_replay_an_audible_opening(live_harness, monkeypatch):
    """A replacement browser socket inherits session-level opening state."""
    first = FakeGeminiSession(turns=[[_response(data=b"opening-audio")]])
    end_call = SimpleNamespace(id="c1", name="end_session", args={})
    second = FakeGeminiSession(
        turns=[[_response(tool_call=SimpleNamespace(function_calls=[end_call]))]]
    )
    live_harness([first, second])
    monkeypatch.setattr(
        live_api,
        "_response_audio_chunks",
        lambda response: [response.data] if response.data else [],
    )

    async def scenario():
        original = FakeBrowserSocket()
        original.query_params = {"token": "t", "pv": "1"}
        replacement = FakeBrowserSocket()
        replacement.query_params = {"token": "t", "pv": "1"}

        original_task = asyncio.create_task(live_api.live_ws(original, "viva", "s1"))
        for _ in range(50):
            if original.sent_bytes:
                break
            await asyncio.sleep(0.01)
        assert original.sent_bytes == [b"opening-audio"]

        replacement_task = asyncio.create_task(live_api.live_ws(replacement, "viva", "s1"))
        await asyncio.wait_for(asyncio.gather(original_task, replacement_task), timeout=2.0)
        assert "turn_complete" in replacement.types_sent()

    asyncio.run(scenario())

    assert len(first.client_content) == 1
    # The replacement inherited proof that opening audio reached the browser.
    # It must not autonomously speak at all; the student's next turn resumes it.
    # Releasing the gate prevents that safe choice from becoming a silent stall.
    assert second.client_content == []


def test_end_returns_when_report_finalization_hangs(live_harness, monkeypatch):
    """A real answer must not leave End waiting forever on report generation."""
    from threading import Event

    end_call = SimpleNamespace(id="c1", name="end_session", args={})
    only = FakeGeminiSession(turns=[[
        _response(_server_content(input_transcription=_text("An index speeds up lookups."))),
        _response(tool_call=SimpleNamespace(function_calls=[end_call])),
    ]])
    live_harness([only])

    started = Event()
    release = Event()

    def hanging_finalize(_self):
        started.set()
        release.wait(timeout=2.0)
        return {"overall_score": 60}

    monkeypatch.setattr(live_api.LivePersistence, "finalize", hanging_finalize)
    monkeypatch.setattr(live_api, "FINALIZE_RESPONSE_TIMEOUT_SECONDS", 0.05)

    socket = FakeBrowserSocket()
    socket.query_params = {"token": "t", "pv": "1"}

    async def scenario():
        task = asyncio.create_task(live_api.live_ws(socket, "viva", "s1"))
        await asyncio.wait_for(task, timeout=2.0)
        assert started.is_set(), "the test did not reach report finalization"
        release.set()
        await asyncio.sleep(0.05)

    asyncio.run(scenario())

    delayed = next(message for message in socket.sent if message.get("type") == "error")
    assert delayed["retryable"] is False
    assert "taking longer" in delayed["message"]
    assert "s1" not in live_api._active_live_owners
