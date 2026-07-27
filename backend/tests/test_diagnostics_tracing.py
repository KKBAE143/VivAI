"""Distributed tracing: browser -> API -> WebSocket -> Gemini.

The point of a trace is to answer "what was the user doing when this broke".
A backend stack trace alone says a Gemini call failed; the trace says it failed
inside the WebSocket opened when the student pressed "Go live" on a mock viva.
"""
from __future__ import annotations

import asyncio
import json

import pytest
from starlette.applications import Starlette
from starlette.responses import PlainTextResponse
from starlette.routing import Route, WebSocketRoute
from starlette.testclient import TestClient

from core.diagnostics import context as ctx
from core.diagnostics import report as R
from core.errors import CatchAllErrorMiddleware
from core.logging import get_logger


# --------------------------------------------------------------------------- #
# Context primitives
# --------------------------------------------------------------------------- #
def test_a_span_nests_under_its_parent():
    tokens = ctx.ensure_trace("tr-fixed")
    try:
        outer = ctx.current_context()["span_id"]
        with ctx.span("gemini.live.connect"):
            inner = ctx.current_context()
            assert inner["trace_id"] == "tr-fixed"
            assert inner["parent_span_id"] == outer
            assert inner["span_id"] != outer
        # …and the span is popped again on exit.
        assert ctx.current_context()["span_id"] == outer
    finally:
        ctx.reset_context(tokens)


def test_a_span_restores_context_even_when_the_body_raises():
    tokens = ctx.ensure_trace("tr-x")
    try:
        before = ctx.current_context()["span_id"]
        with pytest.raises(ValueError):
            with ctx.span("boom"):
                raise ValueError("inner failure")
        assert ctx.current_context()["span_id"] == before
    finally:
        ctx.reset_context(tokens)


def test_a_broken_span_never_breaks_the_work_it_wraps():
    """The wrapped call must survive a diagnostics failure."""
    tokens = ctx.ensure_trace()
    try:
        with ctx.span("fine", weird=object()):
            result = 21 * 2
        assert result == 42
    finally:
        ctx.reset_context(tokens)


# --------------------------------------------------------------------------- #
# HTTP propagation
# --------------------------------------------------------------------------- #
def _app():
    seen: dict = {}

    async def ok(request):
        seen.update(ctx.current_context())
        return PlainTextResponse("ok")

    async def boom(request):
        seen.update(ctx.current_context())
        raise RuntimeError("kaboom")

    app = Starlette(routes=[Route("/ok", ok), Route("/boom", boom)])
    app.add_middleware(CatchAllErrorMiddleware)
    return TestClient(app, raise_server_exceptions=False), seen


def test_the_browsers_trace_is_adopted_by_the_backend():
    client, seen = _app()
    client.get("/ok", headers={"x-diag-trace": "tr-from-browser", "x-diag-span": "sp-click"})
    assert seen["trace_id"] == "tr-from-browser", "the backend started its own trace instead"
    assert seen["parent_span_id"] == "sp-click", "the browser span must become the parent"
    assert seen["span_id"] not in (None, "sp-click"), "the backend needs its own span"


def test_a_request_without_a_trace_still_gets_one():
    """Anything reaching the backend must be traceable, even a curl or a probe."""
    client, seen = _app()
    client.get("/ok")
    assert seen["trace_id"] and seen["trace_id"].startswith("tr-")


def test_the_trace_survives_an_unhandled_exception():
    client, seen = _app()
    res = client.get("/boom", headers={"x-diag-trace": "tr-crash"})
    assert res.status_code == 500
    assert seen["trace_id"] == "tr-crash"


def test_trace_context_does_not_leak_between_requests():
    """contextvars set per request must not bleed into the next one."""
    client, seen = _app()
    client.get("/ok", headers={"x-diag-trace": "tr-first"})
    first = seen["trace_id"]
    client.get("/ok", headers={"x-diag-trace": "tr-second"})
    assert first == "tr-first"
    assert seen["trace_id"] == "tr-second"


# --------------------------------------------------------------------------- #
# WebSocket propagation (query params — browsers cannot set WS headers)
# --------------------------------------------------------------------------- #
def test_the_websocket_leg_carries_the_trace_via_query_params():
    seen: dict = {}

    async def echo(websocket):
        seen.update(ctx.current_context())
        await websocket.accept()
        await websocket.send_text("hi")
        await websocket.close()

    app = Starlette(routes=[WebSocketRoute("/ws", echo)])
    app.add_middleware(CatchAllErrorMiddleware)
    with TestClient(app).websocket_connect("/ws?trace=tr-live&span=sp-start&token=secret") as ws:
        assert ws.receive_text() == "hi"

    assert seen["trace_id"] == "tr-live", "the WS leg lost the trace"
    assert seen["parent_span_id"] == "sp-start"


def test_a_log_line_inside_a_traced_request_carries_the_trace():
    """End of the chain: whatever a deep module logs must be attributable."""
    from core.diagnostics.handler import record_to_event

    tokens = ctx.ensure_trace("tr-deep")
    try:
        with ctx.span("gemini.live.connect", model="gemini-3.1"):
            logger = get_logger("live_service")
            record = logger.makeRecord(
                "horux.live_service", 30, __file__, 1, "model failed to connect", None, None
            )
            event = record_to_event(record)
        assert event["trace_id"] == "tr-deep"
        assert event["span_id"] and event["parent_span_id"]
    finally:
        ctx.reset_context(tokens)


# --------------------------------------------------------------------------- #
# Report rendering
# --------------------------------------------------------------------------- #
def _chain() -> list[dict]:
    """A realistic click -> API -> WS -> Gemini chain with the failure at the leaf."""
    return [
        {
            "ts": "2026-07-27T10:00:00.000+00:00", "source": "frontend", "level": "WARNING",
            "kind": "http_error", "message": "Go live clicked", "trace_id": "tr-1",
            "span_id": "sp-click", "parent_span_id": None, "fingerprint": "a",
        },
        {
            "ts": "2026-07-27T10:00:01.000+00:00", "source": "backend", "level": "WARNING",
            "kind": "log", "message": "live_ws opened", "trace_id": "tr-1",
            "span_id": "sp-ws", "parent_span_id": "sp-click", "fingerprint": "b",
            "context": {"url_path": "/ws/live/viva/s1"},
        },
        {
            "ts": "2026-07-27T10:00:02.000+00:00", "source": "backend", "level": "ERROR",
            "kind": "exception", "message": "live model failed to connect", "trace_id": "tr-1",
            "span_id": "sp-gemini", "parent_span_id": "sp-ws", "fingerprint": "c",
            "logger": "horux.live_service",
        },
    ]


def test_the_report_renders_the_chain_as_a_tree(tmp_path):
    directory = tmp_path / "backend"
    directory.mkdir(parents=True)
    (directory / "events-x.jsonl").write_text(
        "\n".join(json.dumps(e) for e in _chain()) + "\n", encoding="utf-8"
    )
    text = R.build(tmp_path)
    assert "Traces (what the user was doing)" in text
    assert "tr-1" in text

    # Scope to the trace block: the same messages also appear in the Summary
    # table and the Details sections above it.
    traces = text[text.index("## Traces (what the user was doing)") :]

    # Root first, then the WS it opened, then the Gemini call that failed.
    click = traces.index("Go live clicked")
    ws = traces.index("live_ws opened")
    gemini = traces.index("live model failed to connect")
    assert click < ws < gemini, f"chain rendered out of order:\n{traces[:600]}"

    # …and each is indented one level deeper than its parent.
    lines = {
        "click": next(l for l in traces.splitlines() if "Go live clicked" in l),
        "ws": next(l for l in traces.splitlines() if "live_ws opened" in l),
        "gemini": next(l for l in traces.splitlines() if "live model failed" in l),
    }
    indent = {k: len(v) - len(v.lstrip()) for k, v in lines.items()}
    assert indent["click"] < indent["ws"] < indent["gemini"], indent
    assert "/ws/live/viva/s1" in traces
    assert lines["gemini"].lstrip().startswith("x"), "the failing leaf must be marked"


def test_traces_without_a_failure_are_not_printed(tmp_path):
    """A report is for what broke, not a log of everything that worked."""
    directory = tmp_path / "backend"
    directory.mkdir(parents=True)
    healthy = [dict(e, level="INFO", fingerprint=f"h{i}") for i, e in enumerate(_chain())]
    (directory / "events-x.jsonl").write_text(
        "\n".join(json.dumps(e) for e in healthy) + "\n", encoding="utf-8"
    )
    assert "Traces (what the user was doing)" not in R.build(tmp_path)


def test_untraced_events_do_not_break_the_report(tmp_path):
    directory = tmp_path / "backend"
    directory.mkdir(parents=True)
    (directory / "events-x.jsonl").write_text(
        json.dumps({"ts": "2026-07-27T10:00:00+00:00", "level": "ERROR", "message": "no trace",
                    "source": "backend", "kind": "exception", "fingerprint": "z"}) + "\n",
        encoding="utf-8",
    )
    text = R.build(tmp_path)
    assert "no trace" in text
