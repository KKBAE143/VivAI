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
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def configure_logging() -> None:
    """Install the JSON formatter on the root handler. Idempotent."""
    root = logging.getLogger()
    if getattr(root, "_horux_configured", False):
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root.handlers = [handler]
    root.setLevel(logging.INFO)
    root._horux_configured = True  # type: ignore[attr-defined]


def get_logger(name: str) -> logging.Logger:
    """Return a namespaced logger (e.g. ``get_logger("live")`` -> ``horux.live``)."""
    configure_logging()
    return logging.getLogger(f"horux.{name}")
