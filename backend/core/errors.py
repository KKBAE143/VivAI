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

import asyncio
import json
import uuid

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from core.diagnostics import context as diag_context
from core.logging import get_logger

logger = get_logger("http")


def _header(scope: Scope, name: bytes) -> str | None:
    for key, value in scope.get("headers") or []:
        if key == name:
            try:
                return value.decode("latin-1")
            except Exception:  # noqa: BLE001
                return None
    return None


def _query(scope: Scope, name: str) -> str | None:
    """Read one query parameter.

    Needed for WebSockets: the browser WebSocket API cannot set custom request
    headers, so trace ids have to travel in the URL for that leg of the chain.
    """
    try:
        from urllib.parse import parse_qs

        raw = (scope.get("query_string") or b"").decode("latin-1")
        values = parse_qs(raw).get(name)
        return values[0] if values else None
    except Exception:  # noqa: BLE001
        return None


class CatchAllErrorMiddleware:
    """Convert any unhandled exception into a JSON 500 with a correlation id."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "websocket":
            await self._call_websocket(scope, receive, send)
            return
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = uuid.uuid4().hex[:12]
        response_started = False
        # Adopt the browser's trace if it sent one, otherwise start a new one,
        # so a backend failure is always attributable to the click that caused
        # it. The inbound span becomes this span's parent.
        inbound_trace = _header(scope, b"x-diag-trace")
        inbound_span = _header(scope, b"x-diag-span")
        tokens = diag_context.set_context(
            request_id=request_id,
            session_id=_header(scope, b"x-diag-session"),
            route=scope.get("path"),
            trace_id=inbound_trace or diag_context.new_id("tr-"),
            span_id=diag_context.new_id("sp-"),
            parent_span_id=inbound_span,
        )

        async def wrapped_send(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
                # Build NEW containers — mutating the caller's header list in
                # place corrupts a structure the app may still be holding.
                message = {
                    **message,
                    "headers": [
                        *(message.get("headers") or []),
                        (b"x-request-id", request_id.encode()),
                    ],
                }
            await send(message)

        try:
            await self.app(scope, receive, wrapped_send)
        except Exception as exc:  # noqa: BLE001 — this is the last line of defense
            logger.exception(
                "Unhandled exception in request",
                extra={
                    "request_id": request_id,
                    "event": "unhandled_exception",
                    "method": scope.get("method"),
                    "url_path": scope.get("path"),
                },
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
                        (b"x-request-id", request_id.encode()),
                    ],
                }
            )
            await send({"type": "http.response.body", "body": body})
        finally:
            diag_context.reset_context(tokens)

    async def _call_websocket(self, scope: Scope, receive: Receive, send: Send) -> None:
        """Observe websocket failures, then re-raise. Never handle.

        Websockets were previously waved straight through, which left the live
        session subsystem — the most failure-prone part of the app and the part
        that is entirely websocket-based — with no error net at all.

        This branch is strictly log-then-re-raise. Two things it must NOT do:
        swallow `asyncio.CancelledError` (that would break graceful shutdown and
        task cancellation throughout the live-session code, which leans heavily
        on `task.cancel()`), and treat a normal client disconnect as an error.
        """
        request_id = uuid.uuid4().hex[:12]
        # The browser WebSocket API cannot send custom headers, so the trace
        # arrives as a query param here (the frontend appends ?trace=&span=).
        # Fall back to headers so a non-browser client can still propagate.
        inbound_trace = _query(scope, "trace") or _header(scope, b"x-diag-trace")
        inbound_span = _query(scope, "span") or _header(scope, b"x-diag-span")
        tokens = diag_context.set_context(
            request_id=request_id,
            session_id=_query(scope, "diag_session") or _header(scope, b"x-diag-session"),
            route=scope.get("path"),
            trace_id=inbound_trace or diag_context.new_id("tr-"),
            span_id=diag_context.new_id("sp-"),
            parent_span_id=inbound_span,
        )
        try:
            await self.app(scope, receive, send)
        except asyncio.CancelledError:
            # Normal teardown. Re-raise untouched and without logging.
            raise
        except Exception:  # noqa: BLE001
            name = type(_current_exception()).__name__
            if name == "WebSocketDisconnect":
                logger.info(
                    "websocket disconnected",
                    extra={"request_id": request_id, "event": "ws_disconnect"},
                )
            else:
                logger.exception(
                    "Unhandled exception in websocket",
                    extra={
                        "request_id": request_id,
                        "event": "ws_unhandled_exception",
                        "url_path": scope.get("path"),
                    },
                )
            raise
        finally:
            diag_context.reset_context(tokens)


def _current_exception() -> BaseException:
    import sys

    return sys.exc_info()[1] or Exception()
