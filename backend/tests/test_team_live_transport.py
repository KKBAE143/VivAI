"""The Team Viva WebSocket handshake — the layer every unit test skipped.

`test_team_room_faculty.py` and friends drive `VoiceRoom` directly with a fake
socket, so they proved the floor control, the relay and the faculty authority
were right while the transport in front of them could not connect at all. Two
separate faults lived in that blind spot, and both killed the feature outright:

  1. The browser opened `/ws/team-viva/{id}`, but `team_live.router` carries a
     `/api/advanced` prefix, so nothing was mounted there.
  2. The handler accepted the socket (it must, to be able to report an auth
     failure) and `VoiceRoom.connect` accepted it a second time, which raises.

Neither is visible to a test that starts at `VoiceRoom`, so these assert the
contract between the browser and the mount instead.
"""
from __future__ import annotations

import asyncio
import re
from pathlib import Path

import pytest

from ai import team_room
from main import app


REPO_ROOT = Path(__file__).resolve().parents[2]
HOOK = REPO_ROOT / "src" / "lib" / "useTeamViva.ts"


def _mounted_websocket_paths() -> set[str]:
    """Every WebSocket path the app actually serves, prefixes included.

    `app.routes` does not hold the routes directly on this FastAPI version — an
    `include_router` call leaves a wrapper carrying `original_router`, whose own
    routes already have the prefix applied. Walked rather than assumed so this
    keeps working if that internal shape changes again.
    """
    found: set[str] = set()

    def walk(routes) -> None:
        for route in routes:
            if type(route).__name__ == "APIWebSocketRoute":
                found.add(route.path)
            inner = getattr(route, "original_router", None)
            if inner is not None:
                walk(inner.routes)

    walk(app.routes)
    assert found, "no WebSocket routes discovered — this helper needs updating"
    return found


def test_the_room_websocket_is_mounted_under_the_advanced_prefix():
    assert "/api/advanced/ws/team-viva/{session_id}" in _mounted_websocket_paths()


def test_the_browser_connects_to_a_path_that_actually_exists():
    """A cross-language contract test, because the two halves are in different
    languages and the mismatch is invisible until a real browser tries it."""
    source = HOOK.read_text(encoding="utf-8")
    match = re.search(r"wsUrl\(`([^`?]+)", source)
    assert match, f"could not find the wsUrl(...) call in {HOOK}"

    # Turn the template literal into the FastAPI path template.
    client_path = match.group(1).replace("${sessionId}", "{session_id}")
    assert client_path in _mounted_websocket_paths(), (
        f"the browser opens {client_path!r}, which is not mounted. "
        f"Mounted: {sorted(_mounted_websocket_paths())}"
    )


def test_the_solo_live_socket_is_still_mounted_bare():
    """Guards the asymmetry itself: `live.router` has no prefix, and someone
    'fixing' the inconsistency by prefixing it would break every solo session."""
    assert "/ws/live/{mode}/{session_id}" in _mounted_websocket_paths()


class RecordingSocket:
    def __init__(self):
        self.accepts = 0

    async def accept(self):
        self.accepts += 1

    async def send_json(self, payload: dict) -> None:
        return None

    async def send_bytes(self, data: bytes) -> None:
        return None


@pytest.mark.parametrize("as_observer", [False, True])
def test_the_room_never_accepts_a_socket_itself(as_observer: bool):
    """Accepting is the transport's job. Doing it here too raised RuntimeError
    on every real connection while every fake-socket test passed."""

    async def go():
        room = team_room.VoiceRoom("s1", "t1", "p1")
        ws = RecordingSocket()
        if as_observer:
            await room.connect_observer("f1", "Dr. Rao", ws, True)
        else:
            await room.connect("p1", "Asha", ws, tagged=True)
        assert ws.accepts == 0

    asyncio.run(go())
