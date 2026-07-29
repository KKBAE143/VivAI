"""Human-to-human audio relay and faculty takeover in a Team Viva room.

Before this, `broadcast_bytes` was called only for AI speech and mic audio went
only to Gemini — so participants could not hear each other at all, and faculty
could not be in the room. These are the behaviours that makes the room a real
group viva, so they are tested directly rather than through the transport.
"""
from __future__ import annotations

import asyncio

import pytest

from ai import audio_frames, team_room


class FakeSocket:
    def __init__(self):
        self.sent: list[dict] = []
        self.sent_bytes: list[bytes] = []

    async def accept(self):
        return None

    async def send_json(self, payload: dict) -> None:
        self.sent.append(payload)

    async def send_bytes(self, data: bytes) -> None:
        self.sent_bytes.append(data)


async def _room(*, tagged: bool = True, observers: int = 0):
    """A started room with three students and optional faculty observers."""
    room = team_room.VoiceRoom("s1", "t1", "p1")
    sockets = {}
    for pid in ("p1", "p2", "p3"):
        ws = FakeSocket()
        sockets[pid] = ws
        await room.connect(pid, pid.upper(), ws, tagged=tagged)
    for i in range(observers):
        pid = f"f{i + 1}"
        ws = FakeSocket()
        sockets[pid] = ws
        await room.connect_observer(pid, "Dr. Rao", ws, tagged=True)
    room.started = True
    return room, sockets


# --------------------------------------------------------------------------- #
# Human-to-human relay
# --------------------------------------------------------------------------- #
def test_everyone_hears_the_floor_holder_except_themselves():
    async def go():
        room, sockets = await _room()
        room.active_speaker_id = "p2"

        await room.route_client_audio("p2", b"\x11\x22")

        # The speaker hears themselves acoustically; echoing it back is worse.
        assert sockets["p2"].sent_bytes == []
        for pid in ("p1", "p3"):
            frame = audio_frames.decode(sockets[pid].sent_bytes[-1])
            assert frame["kind"] == audio_frames.KIND_HUMAN
            assert frame["sample_rate"] == 16000, "mic audio must not be tagged as 24kHz AI speech"
            assert frame["speaker_id"] == "p2"
            assert frame["payload"] == b"\x11\x22"

    asyncio.run(go())


def test_a_participant_without_the_floor_is_not_relayed_or_sent_to_the_model():
    async def go():
        room, sockets = await _room()
        room.active_speaker_id = "p2"

        await room.route_client_audio("p3", b"\xff")

        assert all(not s.sent_bytes for s in sockets.values()), "side chatter must not be relayed"
        assert room._inbound.qsize() == 0, "and must never reach the examiner"

    asyncio.run(go())


def test_legacy_clients_are_skipped_rather_than_sent_audio_they_would_mangle():
    """A client with no frame decoder would play 16kHz mic audio at 24kHz."""

    async def go():
        room, sockets = await _room(tagged=False)
        room.active_speaker_id = "p2"

        await room.route_client_audio("p2", b"\x01")

        assert all(not s.sent_bytes for s in sockets.values())

    asyncio.run(go())


def test_ai_speech_reaches_everyone_tagged_as_24k():
    async def go():
        room, sockets = await _room(observers=1)

        await room.broadcast_bytes(b"\xab\xcd")

        for pid in ("p1", "p2", "p3", "f1"):
            frame = audio_frames.decode(sockets[pid].sent_bytes[-1])
            assert frame["kind"] == audio_frames.KIND_AI
            assert frame["sample_rate"] == 24000
            assert frame["payload"] == b"\xab\xcd"

    asyncio.run(go())


def test_a_legacy_client_still_gets_bare_ai_pcm():
    """Tagging must not break the clients that predate it."""

    async def go():
        room, sockets = await _room(tagged=False)
        await room.broadcast_bytes(b"\xab\xcd")
        assert sockets["p1"].sent_bytes[-1] == b"\xab\xcd"

    asyncio.run(go())


# --------------------------------------------------------------------------- #
# Observers
# --------------------------------------------------------------------------- #
def test_an_observer_never_consumes_a_student_slot():
    async def go():
        room, _ = await _room(observers=2)
        # MAX_PARTICIPANTS is enforced against `connections`, so faculty sitting
        # in must not push a real student out of their own viva.
        assert len(room.connections) == 3
        assert set(room.observers) == {"f1", "f2"}

    asyncio.run(go())


def test_the_model_can_never_call_on_faculty():
    async def go():
        room, _ = await _room(observers=1)
        room.persist = None
        # `call_on_participant` checks membership of `connections`, which
        # observers are deliberately absent from.
        assert "f1" not in room.connections
        assert room._handle_tool("call_on_participant", {"participant_id": "f1"}) is None

    asyncio.run(go())


def test_the_lobby_lists_observers_so_students_know_faculty_is_watching():
    async def go():
        room, sockets = await _room(observers=1)
        lobby = [m for m in sockets["p1"].sent if m["type"] == "lobby"][-1]
        assert [o["profile_id"] for o in lobby["observers"]] == ["f1"]
        assert lobby["observers"][0]["name"] == "Dr. Rao"

    asyncio.run(go())


def test_faculty_may_always_speak_even_without_the_floor():
    async def go():
        room, _ = await _room(observers=1)
        room.active_speaker_id = "p2"
        assert room.may_speak("f1") is True, "taking over is the point of the role"
        assert room.may_speak("p2") is True
        assert room.may_speak("p3") is False

    asyncio.run(go())


def test_faculty_speech_is_relayed_to_the_whole_room():
    async def go():
        room, sockets = await _room(observers=1)
        room.active_speaker_id = "p2"

        await room.route_client_audio("f1", b"\x77")

        for pid in ("p1", "p2", "p3"):
            frame = audio_frames.decode(sockets[pid].sent_bytes[-1])
            assert frame["speaker_id"] == "f1"
        assert sockets["f1"].sent_bytes == []

    asyncio.run(go())


# --------------------------------------------------------------------------- #
# Pause / takeover
# --------------------------------------------------------------------------- #
def test_pausing_stops_the_model_hearing_anything_but_keeps_humans_talking():
    async def go():
        room, sockets = await _room(observers=1)
        room.active_speaker_id = "p2"

        await room.set_paused("f1", True)
        await room.route_client_audio("p2", b"\x01")

        assert room._inbound.qsize() == 0, "a paused examiner must not hear the room"
        # …but the room is not silenced: that is what makes a takeover usable.
        assert audio_frames.decode(sockets["p1"].sent_bytes[-1])["speaker_id"] == "p2"

    asyncio.run(go())


def test_a_student_cannot_pause_the_examiner():
    async def go():
        room, _ = await _room(observers=1)
        with pytest.raises(PermissionError):
            await room.set_paused("p2", True)
        assert room.paused is False

    asyncio.run(go())


def test_pausing_announces_who_did_it():
    async def go():
        room, sockets = await _room(observers=1)
        await room.set_paused("f1", True)
        msg = [m for m in sockets["p1"].sent if m["type"] == "ai_paused"][-1]
        assert msg["by"] == "Dr. Rao"

    asyncio.run(go())


def test_resuming_does_not_tear_down_the_gemini_connection():
    """Dropping it would lose the conversation and re-trigger the greeting —
    the exact failure the solo bridge had."""

    async def go():
        room, _ = await _room(observers=1)
        sentinel = object()
        room.gemini_session = sentinel
        await room.set_paused("f1", True)
        await room.set_paused("f1", False)
        assert room.gemini_session is sentinel
        assert room.paused is False

    asyncio.run(go())


def test_pausing_twice_is_a_no_op_rather_than_a_double_announcement():
    async def go():
        room, sockets = await _room(observers=1)
        await room.set_paused("f1", True)
        await room.set_paused("f1", True)
        assert len([m for m in sockets["p1"].sent if m["type"] == "ai_paused"]) == 1

    asyncio.run(go())


# --------------------------------------------------------------------------- #
# Manual floor grant
# --------------------------------------------------------------------------- #
def test_faculty_can_hand_the_floor_to_a_chosen_student():
    async def go():
        room, sockets = await _room(observers=1)
        room.active_speaker_id = "p2"

        await room.grant_floor("f1", "p3")

        assert room.may_speak("p3") is True
        assert room.may_speak("p2") is False, "the override replaces the model's choice"
        msg = [m for m in sockets["p1"].sent if m["type"] == "floor"][-1]
        assert msg["speaker_id"] == "p3"
        assert msg["granted_by_faculty"] is True

    asyncio.run(go())


def test_the_floor_can_be_handed_back_to_the_model():
    async def go():
        room, _ = await _room(observers=1)
        room.active_speaker_id = "p2"
        await room.grant_floor("f1", "p3")
        await room.grant_floor("f1", None)
        assert room.floor_override_id is None
        assert room.may_speak("p2") is True

    asyncio.run(go())


def test_faculty_cannot_grant_the_floor_to_someone_outside_the_viva():
    async def go():
        room, _ = await _room(observers=1)
        with pytest.raises(ValueError):
            await room.grant_floor("f1", "stranger")
        assert room.floor_override_id is None

    asyncio.run(go())


def test_a_student_cannot_grant_themselves_the_floor():
    async def go():
        room, _ = await _room(observers=1)
        with pytest.raises(PermissionError):
            await room.grant_floor("p3", "p3")
        assert room.floor_override_id is None

    asyncio.run(go())


def test_a_dropped_floor_holder_releases_the_floor():
    """Otherwise the room waits forever for somebody who has left."""

    async def go():
        room, _ = await _room(observers=1)
        await room.grant_floor("f1", "p3")
        await room.disconnect("p3")
        assert room.floor_override_id is None

    asyncio.run(go())
