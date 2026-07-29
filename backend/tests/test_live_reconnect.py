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


def _response(server_content=None, tool_call=None, resumption_handle=None):
    return SimpleNamespace(
        data=None,
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
    error = next(m for m in socket.sent if m["type"] == "error")
    assert "nothing to record" in error["message"]
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
    # …which must still be nudged, or the examiner goes mute for the rest of the exam.
    assert len(second.client_content) == 1, "a history-less reconnect must be triggered"
    resumed = second.client_content[0]
    assert "ALREADY greeted" in resumed
    assert "Do NOT say hello" in resumed
    # The one thing it must never be: the opening greeting trigger, again.
    assert resumed != first.client_content[0]
    assert "hello + who you are" not in resumed
