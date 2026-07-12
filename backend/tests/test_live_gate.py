"""WS1 regression coverage for the server-side first-turn mic gate."""
from __future__ import annotations

import asyncio

from api.live import _forward_turn_complete


def test_turn_complete_is_forwarded_before_server_mic_gate_opens():
    async def exercise() -> tuple[list[dict], bool, bool]:
        first_turn_done = asyncio.Event()
        gate_state_during_send: list[bool] = []

        class FakeWebSocket:
            async def send_json(self, payload: dict) -> None:
                gate_state_during_send.append(first_turn_done.is_set())
                sent.append(payload)

        sent: list[dict] = []
        await _forward_turn_complete(FakeWebSocket(), first_turn_done)
        return sent, gate_state_during_send[0], first_turn_done.is_set()

    sent, gate_open_during_send, gate_open_after_send = asyncio.run(exercise())

    assert sent == [{"type": "turn_complete"}]
    assert gate_open_during_send is False
    assert gate_open_after_send is True
