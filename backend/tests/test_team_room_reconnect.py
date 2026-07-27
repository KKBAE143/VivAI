"""Team Viva shares the solo bridge's failure modes and needed the same fixes.

`build_team_config` builds its LiveConnectConfig independently of
`live_service.build_config`, so it did NOT inherit the session-lifetime fix:
without compression the Live API hard-terminates a team viva at 15 minutes, and
recycles the connection every ~10 minutes regardless. The room's receive loop
then swallowed the resulting exception and finalized on a partial transcript.
"""
from __future__ import annotations

import asyncio
import contextlib
from types import SimpleNamespace

import pytest
from google.genai import errors as genai_errors

from ai import live_service, team_live_service, team_room


# --------------------------------------------------------------------------- #
# Config
# --------------------------------------------------------------------------- #
def _roster():
    return [{"profile_id": "p1", "name": "Asha"}, {"profile_id": "p2", "name": "Rahul"},
            {"profile_id": "p3", "name": "Meera"}]


def test_team_config_lifts_the_session_duration_cap():
    config = team_live_service.build_team_config(_roster(), "balanced", "English", "", "DBMS")
    assert config.context_window_compression is not None
    assert config.context_window_compression.sliding_window is not None


def test_team_config_opts_into_session_resumption():
    config = team_live_service.build_team_config(_roster(), "balanced", "English", "", "DBMS")
    assert config.session_resumption is not None
    assert config.session_resumption.handle is None
    resumed = team_live_service.build_team_config(
        _roster(), "balanced", "English", "", "DBMS", resume_handle="h-9"
    )
    assert resumed.session_resumption.handle == "h-9"


def test_team_and_solo_share_one_vad_contract():
    """Two hand-maintained copies of the same numbers drift; they must not."""
    team = team_live_service.build_team_config(_roster(), "balanced", "English", "", None)
    solo = live_service.build_config("viva", "balanced", "English", "", subject=None)
    team_vad = team.realtime_input_config.automatic_activity_detection
    solo_vad = solo.realtime_input_config.automatic_activity_detection
    assert team_vad.silence_duration_ms == solo_vad.silence_duration_ms
    assert team_vad.prefix_padding_ms == solo_vad.prefix_padding_ms


# --------------------------------------------------------------------------- #
# Fakes
# --------------------------------------------------------------------------- #
class FakeMemberSocket:
    def __init__(self):
        self.sent: list[dict] = []
        self.sent_bytes: list[bytes] = []

    async def accept(self):
        return None

    async def send_json(self, payload: dict) -> None:
        self.sent.append(payload)

    async def send_bytes(self, data: bytes) -> None:
        self.sent_bytes.append(data)


class FakeGeminiSession:
    def __init__(self, turns: list[list], fail_with: BaseException | None = None):
        self._turns = list(turns)
        self._fail_with = fail_with
        self.client_content: list[str] = []
        self.audio_sent: list[bytes] = []

    async def send_client_content(self, turns=None, turn_complete=True) -> None:
        self.client_content.append("".join(p.text for p in turns.parts))

    async def send_realtime_input(self, **kwargs) -> None:
        blob = kwargs.get("audio") or kwargs.get("media")
        if blob is not None:
            self.audio_sent.append(blob.data)

    async def send_tool_response(self, function_responses=None) -> None:
        return None

    async def receive(self):
        if self._turns:
            for response in self._turns.pop(0):
                yield response
            return
        if self._fail_with is not None:
            raise self._fail_with
        await asyncio.Event().wait()


def _response(server_content=None, tool_call=None, resumption_handle=None):
    return SimpleNamespace(
        data=None,
        server_content=server_content,
        tool_call=tool_call,
        go_away=None,
        session_resumption_update=(
            SimpleNamespace(resumable=True, new_handle=resumption_handle)
            if resumption_handle else None
        ),
    )


def _sc(**kwargs):
    base = {"input_transcription": None, "output_transcription": None,
            "interrupted": None, "turn_complete": None, "model_turn": None}
    return SimpleNamespace(**{**base, **kwargs})


def _text(t):
    return SimpleNamespace(text=t)


@pytest.fixture
def team_env(monkeypatch, fake_supabase):
    monkeypatch.setattr(team_room, "get_supabase", lambda: fake_supabase)
    monkeypatch.setattr(live_service, "reconnect_delay", lambda attempt: 0.0)

    def install(sessions):
        pending = list(sessions)
        configs = []

        @contextlib.asynccontextmanager
        async def fake_connect(config):
            configs.append(config)
            if not pending:
                raise AssertionError("connected more times than scripted")
            yield pending.pop(0)

        monkeypatch.setattr(live_service, "connect_with_fallback", fake_connect)
        return configs

    return install


async def _make_room(sockets: dict[str, FakeMemberSocket]) -> team_room.VoiceRoom:
    room = team_room.VoiceRoom("s1", "t1", "p1")
    for pid, ws in sockets.items():
        await room.connect(pid, pid.upper(), ws)
    return room


# --------------------------------------------------------------------------- #
# Tests
# --------------------------------------------------------------------------- #
def test_a_connection_recycle_resumes_the_viva_instead_of_ending_it(team_env):
    end_call = SimpleNamespace(id="c1", name="end_session", args={})
    first = FakeGeminiSession(
        turns=[[
            _response(_sc(output_transcription=_text("Hello team."), turn_complete=True),
                      resumption_handle="h-1"),
            _response(_sc(input_transcription=_text("Indexes speed up lookups."))),
        ]],
        fail_with=genai_errors.APIError(1011, {"message": "closed"}, None),
    )
    second = FakeGeminiSession(turns=[[
        _response(tool_call=SimpleNamespace(function_calls=[end_call])),
    ]])
    configs = team_env([first, second])

    async def exercise():
        sockets = {"p1": FakeMemberSocket(), "p2": FakeMemberSocket(), "p3": FakeMemberSocket()}
        room = await _make_room(sockets)
        await room.start("p1", None, "ctx", "DBMS", "English", "balanced")
        await asyncio.wait_for(room._pump_task, timeout=5)
        return sockets, room

    sockets, room = asyncio.run(exercise())

    types_seen = [m["type"] for m in sockets["p2"].sent]
    assert "reconnecting" in types_seen, "a recycled connection must reconnect, not end the viva"
    assert "reconnected" in types_seen
    # The viva completed normally and the student's answer survived.
    assert "ended" in types_seen
    assert any(t.get("text") == "Indexes speed up lookups." for t in room.persist.transcript)
    # …and it resumed rather than starting a fresh, history-less session.
    assert configs[0].session_resumption.handle is None
    assert configs[1].session_resumption.handle == "h-1"


def test_the_group_greeting_is_sent_once_across_a_reconnect(team_env):
    end_call = SimpleNamespace(id="c1", name="end_session", args={})
    first = FakeGeminiSession(
        turns=[[
            _response(_sc(output_transcription=_text("Hello everyone."), turn_complete=True),
                      resumption_handle="h-1"),
            _response(_sc(input_transcription=_text("Ready."))),
        ]],
        fail_with=genai_errors.APIError(1011, {"message": "closed"}, None),
    )
    second = FakeGeminiSession(turns=[[_response(tool_call=SimpleNamespace(function_calls=[end_call]))]])
    team_env([first, second])

    async def exercise():
        sockets = {"p1": FakeMemberSocket(), "p2": FakeMemberSocket(), "p3": FakeMemberSocket()}
        room = await _make_room(sockets)
        await room.start("p1", None, "ctx", None, "English", "balanced")
        await asyncio.wait_for(room._pump_task, timeout=5)

    asyncio.run(exercise())

    assert len(first.client_content) == 1, "the first connection greets the team once"
    assert second.client_content == [], "a RESUMED connection must never re-greet the team"


def test_floor_audio_survives_a_reconnect_gap(team_env):
    """Dropping the floor holder's audio mid-answer loses a graded response."""
    end_call = SimpleNamespace(id="c1", name="end_session", args={})
    first = FakeGeminiSession(
        turns=[[_response(_sc(output_transcription=_text("Asha?"), turn_complete=True))]],
        fail_with=genai_errors.APIError(1011, {"message": "closed"}, None),
    )
    second = FakeGeminiSession(turns=[[_response(tool_call=SimpleNamespace(function_calls=[end_call]))]])
    team_env([first, second])

    async def exercise():
        sockets = {"p1": FakeMemberSocket(), "p2": FakeMemberSocket(), "p3": FakeMemberSocket()}
        room = await _make_room(sockets)
        await room.start("p1", None, "ctx", None, "English", "balanced")
        room.active_speaker_id = "p2"
        # Spoken while the first connection is already dead / reconnecting.
        await room.route_client_audio("p2", b"\xaa\xbb")
        await room.route_client_audio("p3", b"\xcc\xdd")  # not their floor
        await asyncio.wait_for(room._pump_task, timeout=5)
        return room

    asyncio.run(exercise())

    delivered = first.audio_sent + second.audio_sent
    assert b"\xaa\xbb" in delivered, "the floor holder's audio was lost across the reconnect"
    assert b"\xcc\xdd" not in delivered, "off-floor audio must still be dropped"


def test_a_failed_start_does_not_wedge_the_room(team_env):
    """`started` used to stay True after a failed connect, so start() short-
    circuited forever and the lead could never retry."""

    @contextlib.asynccontextmanager
    async def failing_connect(config):
        raise RuntimeError("no live model available")
        yield  # pragma: no cover

    async def exercise():
        sockets = {"p1": FakeMemberSocket(), "p2": FakeMemberSocket(), "p3": FakeMemberSocket()}
        room = await _make_room(sockets)
        import ai.live_service as ls

        original = ls.connect_with_fallback
        ls.connect_with_fallback = failing_connect
        try:
            with pytest.raises(RuntimeError):
                await room.start("p1", None, "ctx", None, "English", "balanced")
        finally:
            ls.connect_with_fallback = original
        return room

    room = asyncio.run(exercise())
    assert room.started is False, "a failed start must leave the room retryable"
    assert room.gemini_session is None


def test_unrecoverable_errors_are_not_retried_forever(team_env):
    """A bad API key must fail fast, not burn the whole reconnect budget."""
    only = FakeGeminiSession(
        turns=[[_response(_sc(input_transcription=_text("Hi.")))]],
        fail_with=genai_errors.ClientError(401, {"message": "bad key"}, None),
    )
    team_env([only])  # exactly ONE connection is scripted

    async def exercise():
        sockets = {"p1": FakeMemberSocket(), "p2": FakeMemberSocket(), "p3": FakeMemberSocket()}
        room = await _make_room(sockets)
        await room.start("p1", None, "ctx", None, "English", "balanced")
        await asyncio.wait_for(room._pump_task, timeout=5)
        return sockets

    sockets = asyncio.run(exercise())
    types_seen = [m["type"] for m in sockets["p1"].sent]
    assert "reconnecting" not in types_seen
    assert "ended" in types_seen
