"""Regression coverage for the live-session failures found in end-to-end testing.

Each test here pins down one root cause that previously shipped:

* Bug 1 (double greeting) — a second WebSocket for the same session_id was
  recorded but never closed, so two Gemini sessions each greeted.
* Bugs 2/3/4 (premature end, ~0% reports, "nothing was recorded") — the Live
  API terminates a session on duration alone (15 min audio-only, **2 min with
  video**) unless context-window compression is configured, and recycles the
  underlying connection roughly every 10 minutes unless session resumption is.
  Neither was configured, and the resulting exception was swallowed.
"""
from __future__ import annotations

import asyncio

import pytest

from ai import live_service
from api import live as live_api


# --------------------------------------------------------------------------- #
# Session lifetime configuration (Bugs 2, 3, 4)
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("mode", ["viva", "presentation", "coach", "pitch"])
def test_every_mode_configures_unlimited_session_duration(mode):
    """Without sliding-window compression Google kills video sessions at 2 min.

    Presentation (screen) and Coach (camera) both stream video, so this is the
    difference between a full exam and a two-minute stub graded as ~0%.
    """
    config = live_service.build_config(mode, "balanced", "English", "", subject="DBMS")
    compression = config.context_window_compression
    assert compression is not None, f"{mode} has no context window compression"
    assert compression.sliding_window is not None


@pytest.mark.parametrize("mode", ["viva", "presentation", "coach", "pitch"])
def test_every_mode_opts_into_session_resumption(mode):
    """A Live connection lives ~10 minutes; resumption carries the exam across."""
    config = live_service.build_config(mode, "balanced", "English", "", subject="DBMS")
    assert config.session_resumption is not None
    # A brand-new session starts with no handle.
    assert config.session_resumption.handle is None


def test_resume_handle_is_threaded_into_the_config():
    config = live_service.build_config(
        "viva", "balanced", "English", "", subject="DBMS", resume_handle="handle-abc"
    )
    assert config.session_resumption.handle == "handle-abc"


# --------------------------------------------------------------------------- #
# Single-owner connection management (Bug 1)
# --------------------------------------------------------------------------- #
class FakeWebSocket:
    def __init__(self):
        self.closed_with: int | None = None

    async def close(self, code: int = 1000) -> None:
        self.closed_with = code


@pytest.fixture(autouse=True)
def _clean_owner_registry():
    live_api._active_live_owners.clear()
    yield
    live_api._active_live_owners.clear()


def test_superseding_actually_closes_the_previous_socket():
    """The old registry only overwrote a connection id — both sockets, and both
    Gemini sessions, stayed alive and each sent its own greeting."""

    async def exercise():
        first_ws, second_ws = FakeWebSocket(), FakeWebSocket()
        first = live_api.LiveOwner(connection_id="a", websocket=first_ws)
        second = live_api.LiveOwner(connection_id="b", websocket=second_ws)

        assert await live_api.claim_live_owner("s1", first) is None
        # The loser must release itself; in the real handler its reader task
        # observes the close and tears down.
        release = asyncio.create_task(_release_soon("s1", first))
        superseded = await live_api.claim_live_owner("s1", second)
        await release
        return first_ws, second_ws, superseded, first

    first_ws, second_ws, superseded, first = asyncio.run(exercise())

    assert superseded is first
    assert first_ws.closed_with == live_api.WS_SUPERSEDED_CODE, "old socket was never closed"
    assert second_ws.closed_with is None, "the winning socket must stay open"
    assert first.superseded.is_set()
    assert live_api._active_live_owners["s1"].connection_id == "b"


async def _release_soon(session_id: str, owner: live_api.LiveOwner) -> None:
    await owner.superseded.wait()
    await live_api.release_live_owner(session_id, owner)


def test_supersede_does_not_hang_forever_on_a_wedged_socket():
    """A socket that never drains must not block the student's retry."""

    async def exercise():
        first = live_api.LiveOwner(connection_id="a", websocket=FakeWebSocket())
        second = live_api.LiveOwner(connection_id="b", websocket=FakeWebSocket())
        await live_api.claim_live_owner("s1", first)
        # `first` never calls release_live_owner — claim must still return.
        await asyncio.wait_for(
            live_api.claim_live_owner("s1", second),
            timeout=live_api.SUPERSEDE_DRAIN_SECONDS + 2,
        )
        return live_api._active_live_owners["s1"].connection_id

    assert asyncio.run(exercise()) == "b"


def test_release_only_clears_its_own_claim():
    """A late-releasing stale owner must not evict the live one."""

    async def exercise():
        first = live_api.LiveOwner(connection_id="a", websocket=FakeWebSocket())
        second = live_api.LiveOwner(connection_id="b", websocket=FakeWebSocket())
        await live_api.claim_live_owner("s1", first)
        live_api._active_live_owners["s1"] = second
        await live_api.release_live_owner("s1", first)
        return live_api._active_live_owners.get("s1"), second

    still_registered, second = asyncio.run(exercise())
    assert still_registered is second


# --------------------------------------------------------------------------- #
# Finalize policy (Bugs 3, 4)
# --------------------------------------------------------------------------- #
def test_superseded_connection_never_touches_the_session_row():
    """Otherwise a stale socket reverts a session the new socket is running."""
    assert live_api.should_finalize(superseded=True, has_activity=True) is False
    assert live_api.should_finalize(superseded=True, has_activity=False) is False


def test_a_real_conversation_is_finalized_even_after_a_transport_error():
    """A drop at minute twelve must still produce the student's report."""
    assert live_api.should_finalize(superseded=False, has_activity=True) is True


def test_a_silent_session_is_reverted_not_graded():
    assert live_api.should_finalize(superseded=False, has_activity=False) is False


# --------------------------------------------------------------------------- #
# Reconnect classification (Bug 2)
# --------------------------------------------------------------------------- #
def _build_api_error(cls, code):
    """Construct an SDK error without an HTTP response object to wrap."""
    from google.genai import errors as genai_errors

    err = genai_errors.APIError.__new__(cls)
    err.code = code
    err.message = "boom"
    err.status = None
    err.details = None
    err.response = None
    return err


def test_connection_recycles_are_treated_as_recoverable():
    from google.genai import errors as genai_errors

    # 1000/1006/1011 websocket closes surface as a bare APIError.
    assert live_api.is_recoverable_live_error(_build_api_error(genai_errors.APIError, 1000))
    assert live_api.is_recoverable_live_error(_build_api_error(genai_errors.APIError, 1011))
    assert live_api.is_recoverable_live_error(_build_api_error(genai_errors.ServerError, 503))
    assert live_api.is_recoverable_live_error(ConnectionResetError("reset"))


def test_auth_and_config_failures_are_not_retried_forever():
    from google.genai import errors as genai_errors

    assert not live_api.is_recoverable_live_error(_build_api_error(genai_errors.ClientError, 401))
    assert not live_api.is_recoverable_live_error(_build_api_error(genai_errors.ClientError, 400))
    # …but backpressure is worth a retry.
    assert live_api.is_recoverable_live_error(_build_api_error(genai_errors.ClientError, 429))


def test_cancellation_and_client_disconnect_are_not_reconnect_reasons():
    from fastapi import WebSocketDisconnect

    assert not live_api.is_recoverable_live_error(asyncio.CancelledError())
    assert not live_api.is_recoverable_live_error(WebSocketDisconnect(1000))


def test_reconnect_backoff_is_bounded():
    delays = [live_api._reconnect_delay(i) for i in range(1, 10)]
    assert delays[0] < delays[1] < delays[2], "backoff should grow"
    assert max(delays) <= 5.0, "backoff must stay bounded"
