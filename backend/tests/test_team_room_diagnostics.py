"""The Team Viva room's silent failure paths now leave evidence.

Three `except Exception: pass` blocks sat in the broadcast and relay loops, and
faculty control refusals were sent to the client and recorded nowhere. Both are
on the differentiating feature, and both produce the same user-visible symptom —
"I could not hear anyone", "the takeover button did nothing" — with nothing on
disk to explain it.

These assert the events fire, and just as importantly that they fire ONCE per
broken socket: the relay runs tens of times a second, so a naive warning would
flood the diagnostics sink with copies of one fault.
"""
from __future__ import annotations

import asyncio
import logging

import pytest

from ai import team_room


LOGGER = "horux.team_room"


class FakeSocket:
    def __init__(self, *, fail: bool = False, exc: type[BaseException] = RuntimeError):
        self.sent: list[dict] = []
        self.sent_bytes: list[bytes] = []
        self.fail = fail
        self.exc = exc

    async def accept(self):
        return None

    async def send_json(self, payload: dict) -> None:
        if self.fail:
            raise self.exc("socket is closed")
        self.sent.append(payload)

    async def send_bytes(self, data: bytes) -> None:
        if self.fail:
            raise self.exc("socket is closed")
        self.sent_bytes.append(data)


async def _room(*, failing: set[str] | None = None, observers: int = 0):
    failing = failing or set()
    room = team_room.VoiceRoom("s1", "t1", "p1")
    sockets: dict[str, FakeSocket] = {}
    for pid in ("p1", "p2", "p3"):
        ws = FakeSocket(fail=pid in failing)
        sockets[pid] = ws
        await room.connect(pid, pid.upper(), ws, tagged=True)
    for i in range(observers):
        pid = f"f{i + 1}"
        ws = FakeSocket(fail=pid in failing)
        sockets[pid] = ws
        await room.connect_observer(pid, "Dr. Rao", ws, tagged=True)
    room.started = True
    # Joining broadcasts a lobby update, which already trips the suppression for
    # any socket that starts out broken. Reset it so each test starts from a room
    # that has reported nothing yet.
    room._send_failed.clear()
    return room, sockets


def _events(caplog, event: str) -> list[logging.LogRecord]:
    return [r for r in caplog.records if getattr(r, "event", None) == event]


@pytest.fixture(autouse=True)
def _capture(caplog):
    caplog.set_level(logging.WARNING, logger=LOGGER)
    return caplog


# --------------------------------------------------------------------------- #
# Dropped sends
# --------------------------------------------------------------------------- #
def test_a_dead_socket_during_ai_speech_is_recorded_not_swallowed(caplog):
    async def go():
        room, sockets = await _room(failing={"p2"})
        caplog.clear()

        await room.broadcast_bytes(b"\xab")

        records = _events(caplog, "room_send_failed")
        assert len(records) == 1
        assert records[0].component == "ai_audio"
        assert records[0].reason == "RuntimeError"
        assert records[0].session_id == "s1"
        assert records[0].exc_info is not None, "the stack is the useful part"
        # Still swallowed: one broken listener must not silence the room.
        assert sockets["p1"].sent_bytes and sockets["p3"].sent_bytes

    asyncio.run(go())


def test_a_broken_relay_target_is_recorded_with_its_own_channel(caplog):
    """Distinguishable from an AI-audio failure — one means the student cannot
    hear the examiner, the other means they cannot hear their teammates."""

    async def go():
        room, _ = await _room(failing={"p3"})
        room.active_speaker_id = "p2"
        caplog.clear()

        await room.route_client_audio("p2", b"\x01")

        records = _events(caplog, "room_send_failed")
        assert [r.component for r in records] == ["human_relay"]

    asyncio.run(go())


def test_a_failed_lobby_update_is_recorded(caplog):
    async def go():
        room, _ = await _room(failing={"p2"})
        caplog.clear()
        await room.broadcast(room._lobby_message())
        assert [r.component for r in _events(caplog, "room_send_failed")] == ["lobby"]

    asyncio.run(go())


def test_a_persistently_dead_socket_is_reported_once_not_once_per_frame(caplog):
    """50 frames a second times the length of a viva is not a diagnostic, it is
    a denial of service against the sink."""

    async def go():
        room, _ = await _room(failing={"p2"})
        caplog.clear()

        for _ in range(50):
            await room.broadcast_bytes(b"\xab")

        assert len(_events(caplog, "room_send_failed")) == 1

    asyncio.run(go())


def test_a_socket_that_recovers_can_be_reported_again(caplog):
    """Otherwise a flapping connection is reported once and then never again,
    which hides exactly the intermittent case that is hardest to reproduce."""

    async def go():
        room, sockets = await _room(failing={"p2"})
        caplog.clear()

        await room.broadcast_bytes(b"\x01")
        sockets["p2"].fail = False
        await room.broadcast_bytes(b"\x02")
        sockets["p2"].fail = True
        await room.broadcast_bytes(b"\x03")

        assert len(_events(caplog, "room_send_failed")) == 2

    asyncio.run(go())


def test_leaving_the_room_clears_the_suppression(caplog):
    async def go():
        room, sockets = await _room(failing={"p2"})
        await room.broadcast_bytes(b"\x01")
        await room.disconnect("p2")
        caplog.clear()

        # Same person rejoins on a new socket that is also broken.
        await room.connect("p2", "P2", FakeSocket(fail=True), tagged=True)
        await room.broadcast_bytes(b"\x02")

        assert len(_events(caplog, "room_send_failed")) >= 1

    asyncio.run(go())


def test_a_healthy_room_logs_nothing(caplog):
    async def go():
        room, _ = await _room(observers=1)
        room.active_speaker_id = "p2"
        caplog.clear()

        await room.broadcast_bytes(b"\x01")
        await room.route_client_audio("p2", b"\x02")
        await room.broadcast(room._lobby_message())

        assert _events(caplog, "room_send_failed") == []

    asyncio.run(go())


# --------------------------------------------------------------------------- #
# Refused faculty controls
# --------------------------------------------------------------------------- #
def test_a_refused_pause_is_recorded(caplog):
    async def go():
        room, _ = await _room(observers=1)
        caplog.clear()

        with pytest.raises(PermissionError):
            await room.set_paused("p2", True)

        records = _events(caplog, "faculty_control_refused")
        assert len(records) == 1
        assert records[0].component == "pause"
        assert records[0].reason == "not_an_observer"
        assert records[0].session_id == "s1"

    asyncio.run(go())


def test_a_refused_floor_grant_is_recorded(caplog):
    async def go():
        room, _ = await _room(observers=1)
        caplog.clear()

        with pytest.raises(PermissionError):
            await room.grant_floor("p2", "p3")

        records = _events(caplog, "faculty_control_refused")
        assert [(r.component, r.reason) for r in records] == [("grant_floor", "not_an_observer")]

    asyncio.run(go())


def test_granting_the_floor_to_someone_who_left_is_recorded_distinctly(caplog):
    """A faculty member clicking a student who just dropped is a different
    problem from an authorization failure, and used to look identical."""

    async def go():
        room, _ = await _room(observers=1)
        caplog.clear()

        with pytest.raises(ValueError):
            await room.grant_floor("f1", "stranger")

        records = _events(caplog, "faculty_control_refused")
        assert [(r.component, r.reason) for r in records] == [
            ("grant_floor", "unknown_participant")
        ]

    asyncio.run(go())


def test_an_allowed_control_logs_nothing(caplog):
    async def go():
        room, _ = await _room(observers=1)
        caplog.clear()

        await room.set_paused("f1", True)
        await room.grant_floor("f1", "p3")

        assert _events(caplog, "faculty_control_refused") == []

    asyncio.run(go())
