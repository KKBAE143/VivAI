"""Contract tests for CatchAllErrorMiddleware.

This middleware sits in the path of 100% of HTTP traffic, so the diagnostics
change to it must be a provable strict superset. These tests were written to
pass against the PRE-change file and must keep passing afterwards; the
X-Request-Id and websocket tests are the only additions.
"""
from __future__ import annotations

import json

import pytest
from starlette.applications import Starlette
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import PlainTextResponse, StreamingResponse
from starlette.routing import Route, WebSocketRoute
from starlette.testclient import TestClient

from core.errors import CatchAllErrorMiddleware


def _client(*, with_cors: bool = True) -> TestClient:
    async def boom(request):
        raise RuntimeError("kaboom")

    async def ok(request):
        return PlainTextResponse("ok")

    async def streamer(request):
        async def body():
            yield b"partial"
            raise RuntimeError("died mid-stream")

        return StreamingResponse(body())

    app = Starlette(
        routes=[Route("/boom", boom), Route("/ok", ok), Route("/stream", streamer)]
    )
    app.add_middleware(CatchAllErrorMiddleware)
    if with_cors:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["http://localhost:3000"],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
            expose_headers=["X-Request-Id"],
        )
    return TestClient(app, raise_server_exceptions=False)


# --------------------------------------------------------------------------- #
# Characterization — true before AND after the diagnostics change
# --------------------------------------------------------------------------- #
def test_a_successful_response_passes_through_untouched():
    res = _client().get("/ok")
    assert res.status_code == 200
    assert res.text == "ok"


def test_an_unhandled_exception_becomes_a_json_500_with_a_request_id():
    res = _client().get("/boom")
    assert res.status_code == 500
    body = json.loads(res.text)
    assert "Internal server error" in body["detail"]
    assert "RuntimeError" in body["detail"]
    assert body["request_id"]


def test_the_500_still_carries_cors_headers():
    """The entire reason this is middleware and not an exception handler: a 500
    without CORS headers is unreadable by the browser, which then reports only
    'backend is not running'."""
    res = _client().get("/boom", headers={"Origin": "http://localhost:3000"})
    assert res.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_an_error_after_the_response_started_is_re_raised_not_rewritten():
    """Once bytes are on the wire the status line cannot be changed, so the
    middleware must let the error propagate rather than emit a second
    http.response.start — which would be an ASGI protocol violation.

    Driven directly at the ASGI layer: TestClient cannot express "the response
    began and then the app died" without swallowing the distinction.
    """
    import asyncio

    sent: list[dict] = []

    async def app_that_dies_mid_response(scope, receive, send):
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"partial", "more_body": True})
        raise RuntimeError("died mid-stream")

    async def send(message):
        sent.append(message)

    async def receive():
        return {"type": "http.request"}

    middleware = CatchAllErrorMiddleware(app_that_dies_mid_response)
    scope = {"type": "http", "method": "GET", "path": "/stream", "headers": []}

    with pytest.raises(RuntimeError, match="died mid-stream"):
        asyncio.run(middleware(scope, receive, send))

    starts = [m for m in sent if m["type"] == "http.response.start"]
    assert len(starts) == 1, "the middleware must not start a second response"
    assert starts[0]["status"] == 200, "the already-sent status must not be rewritten"


# --------------------------------------------------------------------------- #
# Additions
# --------------------------------------------------------------------------- #
def test_the_request_id_is_exposed_as_a_response_header():
    """Lets a frontend error record the id of the backend failure that caused
    it, which is the join key between the two halves of a report."""
    res = _client().get("/boom", headers={"Origin": "http://localhost:3000"})
    body = json.loads(res.text)
    assert res.headers.get("x-request-id") == body["request_id"]


def test_successful_responses_also_carry_a_request_id():
    res = _client().get("/ok")
    assert res.headers.get("x-request-id")


def test_websocket_traffic_still_works_through_the_middleware():
    """Websockets were previously waved through untouched. Adding observation
    must not change the handshake or the message flow."""

    async def echo(websocket):
        await websocket.accept()
        await websocket.send_text("hello")
        await websocket.close()

    app = Starlette(routes=[WebSocketRoute("/ws", echo)])
    app.add_middleware(CatchAllErrorMiddleware)
    with TestClient(app).websocket_connect("/ws") as ws:
        assert ws.receive_text() == "hello"


def test_a_websocket_handler_error_still_propagates():
    """Log-then-re-raise: the middleware must observe, never handle."""

    async def bad(websocket):
        await websocket.accept()
        raise RuntimeError("ws blew up")

    app = Starlette(routes=[WebSocketRoute("/ws", bad)])
    app.add_middleware(CatchAllErrorMiddleware)
    with pytest.raises(RuntimeError):
        with TestClient(app).websocket_connect("/ws") as ws:
            ws.receive_text()
