"""Global catch-all error handling (Issue 6).

Why a pure-ASGI middleware and NOT ``@app.exception_handler(Exception)``:
FastAPI/Starlette runs exception handlers inside ``ServerErrorMiddleware``,
which sits OUTSIDE ``CORSMiddleware``. A 500 produced there never gets CORS
headers, so the browser blocks the response and the frontend can only report a
generic "backend is not running" — which is the exact bug we are fixing.

By adding this middleware BEFORE ``CORSMiddleware`` in code order (so CORS is
the outermost wrapper), every unhandled exception becomes a clean JSON 500 that
still carries ``Access-Control-Allow-Origin`` and is therefore readable by the
browser.
"""
from __future__ import annotations

import json
import uuid

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from core.logging import get_logger

logger = get_logger("http")


class CatchAllErrorMiddleware:
    """Convert any unhandled exception into a JSON 500 with a correlation id."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = uuid.uuid4().hex[:12]
        response_started = False

        async def wrapped_send(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, receive, wrapped_send)
        except Exception as exc:  # noqa: BLE001 — this is the last line of defense
            logger.exception(
                "Unhandled exception in request",
                extra={"request_id": request_id, "event": "unhandled_exception"},
            )
            # If the response already started streaming we cannot rewrite it —
            # let the error propagate so the server closes the connection.
            if response_started:
                raise
            body = json.dumps(
                {
                    "detail": f"Internal server error ({type(exc).__name__})",
                    "request_id": request_id,
                }
            ).encode()
            await send(
                {
                    "type": "http.response.start",
                    "status": 500,
                    "headers": [
                        (b"content-type", b"application/json"),
                        (b"content-length", str(len(body)).encode()),
                    ],
                }
            )
            await send({"type": "http.response.body", "body": body})
