"""Ambient correlation ids for the current request / live session.

These let a log line emitted deep inside ``ai/team_room.py`` carry the
``request_id`` of the HTTP request that started it, without every function in
between having to accept and forward it.

``contextvars`` (not thread locals) because the whole backend is async and a
single thread interleaves many requests.

Tracing model
-------------
``trace_id`` spans one logical user operation end to end — a click in the
browser, the API call it makes, the WebSocket it opens, and the Gemini calls
that happen inside it. ``span_id``/``parent_span_id`` give that trace its shape,
so a report can show::

    trace 9f3a…  "start mock viva"
      └─ frontend  POST /api/viva/sessions
         └─ backend  api.viva.create_session
            └─ gemini generate_json (questions)
      └─ frontend  ws /ws/live/viva/<id>
         └─ backend  live_ws
            └─ gemini live.connect
               └─ gemini receive loop  ← the failure

Without it, a Gemini timeout and the 500 the student actually saw are two
unrelated lines in two different files.
"""
from __future__ import annotations

import os
import uuid
from contextlib import contextmanager
from contextvars import ContextVar

_run_id: ContextVar[str | None] = ContextVar("diag_run_id", default=None)
_request_id: ContextVar[str | None] = ContextVar("diag_request_id", default=None)
_session_id: ContextVar[str | None] = ContextVar("diag_session_id", default=None)
_route: ContextVar[str | None] = ContextVar("diag_route", default=None)
_trace_id: ContextVar[str | None] = ContextVar("diag_trace_id", default=None)
_span_id: ContextVar[str | None] = ContextVar("diag_span_id", default=None)
_parent_span_id: ContextVar[str | None] = ContextVar("diag_parent_span_id", default=None)

# One id per app launch, shared with the frontend through HORUX_RUN_ID so a
# browser event and a backend event from the same `start-app.bat` line up.
PROCESS_RUN_ID = os.environ.get("HORUX_RUN_ID") or f"run-{uuid.uuid4().hex[:10]}"


def new_id(prefix: str = "") -> str:
    return f"{prefix}{uuid.uuid4().hex[:16]}"


def set_context(
    *,
    request_id: str | None = None,
    session_id: str | None = None,
    route: str | None = None,
    run_id: str | None = None,
    trace_id: str | None = None,
    span_id: str | None = None,
    parent_span_id: str | None = None,
) -> list:
    """Set any provided ids; returns tokens to pass to :func:`reset_context`."""
    pairs = (
        (_run_id, run_id),
        (_request_id, request_id),
        (_session_id, session_id),
        (_route, route),
        (_trace_id, trace_id),
        (_span_id, span_id),
        (_parent_span_id, parent_span_id),
    )
    tokens = []
    for var, value in pairs:
        if value is not None:
            tokens.append((var, var.set(value)))
    return tokens


def reset_context(tokens: list) -> None:
    """Restore the previous values. Never raises."""
    for var, token in reversed(tokens):
        try:
            var.reset(token)
        except Exception:  # noqa: BLE001 — a stale token must not break teardown
            pass


def current_context() -> dict[str, str | None]:
    return {
        "run_id": _run_id.get() or PROCESS_RUN_ID,
        "request_id": _request_id.get(),
        "session_id": _session_id.get(),
        "route": _route.get(),
        "trace_id": _trace_id.get(),
        "span_id": _span_id.get(),
        "parent_span_id": _parent_span_id.get(),
    }


@contextmanager
def span(name: str, **attributes):
    """Open a child span for the duration of the block.

    Purely for correlation — it records no timing of its own and emits no event
    on the happy path. Anything logged inside inherits the span, so a Gemini
    failure names both the call it happened in and the request that caused it.

    Never raises on its own: a broken span must not break the work it wraps.
    """
    from core.diagnostics import capture  # local import avoids a cycle

    parent = _span_id.get()
    tokens = set_context(span_id=new_id("sp-"), parent_span_id=parent)
    try:
        yield
    except Exception:
        try:
            capture(f"span failed: {name}", event="span_failed", tag=name, **attributes)
        except Exception:  # noqa: BLE001
            pass
        raise
    finally:
        reset_context(tokens)


def ensure_trace(trace_id: str | None = None) -> list:
    """Start (or adopt) a trace. Returns tokens for :func:`reset_context`."""
    return set_context(trace_id=trace_id or new_id("tr-"), span_id=new_id("sp-"))
