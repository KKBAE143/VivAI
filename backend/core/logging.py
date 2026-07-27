"""Structured JSON logging for production observability (REVIEW v2 / R2).

Every log line is a single JSON object so it can be shipped to any log
aggregator and filtered by ``session_id`` (the natural correlation id across a
live-session lifecycle) or ``request_id`` (per REST request).

IMPORTANT: never log transcript text or other user content at INFO — log ids
and counts only. PII stays in the database, not the log stream.
"""
from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone

# Keys we promote from ``record.__dict__`` (set via ``logger.info(..., extra=...)``)
# into the top level of the JSON line for easy filtering.
_CONTEXT_KEYS = ("session_id", "request_id", "user_id", "mode", "event")

# Attributes every LogRecord carries. Anything in ``record.__dict__`` that is
# NOT one of these and not already promoted above was supplied by the caller via
# ``extra=`` — and used to be silently discarded. ``api/live.py`` logs
# ``reason``/``reconnects``/``has_activity`` on its richest event and all three
# vanished, so the line existed but said nothing useful.
_STD_RECORD_ATTRS = frozenset(
    {
        "args", "asctime", "created", "exc_info", "exc_text", "filename", "funcName",
        "levelname", "levelno", "lineno", "message", "module", "msecs", "msg", "name",
        "pathname", "process", "processName", "relativeCreated", "stack_info",
        "taskName", "thread", "threadName",
    }
)


class JsonFormatter(logging.Formatter):
    """Render a log record as one JSON line."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "ts": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for key in _CONTEXT_KEYS:
            value = getattr(record, key, None)
            if value is not None:
                payload[key] = value
        # Everything else the caller passed via extra=, under one nested key so
        # the top-level shape existing consumers filter on is unchanged.
        extras = {
            key: value
            for key, value in record.__dict__.items()
            if key not in _STD_RECORD_ATTRS and key not in _CONTEXT_KEYS and not key.startswith("_")
        }
        if extras:
            payload["ctx"] = extras
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def _diagnostics_handlers() -> list[logging.Handler]:
    """Optional file-sink handler for local diagnostics capture.

    Deliberately defensive: this runs at import time for the whole backend, so
    anything that raises here takes the app down. It returns an empty list on
    ANY failure, and the sink itself opens its file lazily on first write — so
    an unwritable diagnostics directory cannot stop the server from booting.
    """
    try:
        from core.config import get_settings

        settings = get_settings()
        if not getattr(settings, "diagnostics_enabled", False):
            return []
        from core.diagnostics.handler import bridge
        from core.diagnostics.sink import build_sink

        level = logging.getLevelName(str(settings.diagnostics_level).upper())
        if not isinstance(level, int):
            level = logging.WARNING
        queue_handler = bridge.start(build_sink(settings), level)
        return [queue_handler] if queue_handler is not None else []
    except Exception as exc:  # noqa: BLE001 — never break logging setup
        # Deliberately `print` and not `logger`: this runs *while* logging is
        # being configured, so the logger is not yet safe to use. One of only
        # two bare prints left in the backend, both for this same reason.
        print(f"[diagnostics] capture unavailable: {exc}")
        return []


def configure_logging() -> None:
    """Install the JSON formatter on the root handler. Idempotent."""
    root = logging.getLogger()
    if getattr(root, "_horux_configured", False):
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    # Set the sentinel BEFORE building the optional handler: _diagnostics_handlers
    # imports core.config, which can re-enter get_logger, and without the guard
    # already in place that recurses.
    root.handlers = [handler]
    root.setLevel(logging.INFO)
    root._horux_configured = True  # type: ignore[attr-defined]
    root.handlers = [handler, *_diagnostics_handlers()]


def get_logger(name: str) -> logging.Logger:
    """Return a namespaced logger (e.g. ``get_logger("live")`` -> ``horux.live``)."""
    configure_logging()
    return logging.getLogger(f"horux.{name}")
