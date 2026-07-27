"""Characterization + regression tests for the JSON log formatter.

`configure_logging()` runs at import time for every backend module, so a raise
here is a total outage — the app will not boot and pytest collection dies. The
first group of tests pins the EXISTING behaviour so the diagnostics change can
be shown to be a strict superset; the second covers the new `ctx` bag.
"""
from __future__ import annotations

import json
import logging

from core.logging import JsonFormatter


def _format(record: logging.LogRecord) -> dict:
    return json.loads(JsonFormatter().format(record))


def _record(msg: str = "hello", level: int = logging.INFO, **extra) -> logging.LogRecord:
    record = logging.LogRecord("horux.test", level, __file__, 10, msg, None, None)
    for key, value in extra.items():
        setattr(record, key, value)
    return record


# --------------------------------------------------------------------------- #
# Characterization — must remain true after the diagnostics change
# --------------------------------------------------------------------------- #
def test_base_payload_shape_is_unchanged():
    payload = _format(_record("a message"))
    assert payload["level"] == "INFO"
    assert payload["logger"] == "horux.test"
    assert payload["msg"] == "a message"
    assert payload["ts"].endswith("+00:00")


def test_the_five_promoted_context_keys_stay_top_level():
    """Existing log consumers filter on these by name at the top level."""
    payload = _format(
        _record(session_id="s1", request_id="r1", user_id="u1", mode="viva", event="live_ws_stop")
    )
    assert payload["session_id"] == "s1"
    assert payload["request_id"] == "r1"
    assert payload["user_id"] == "u1"
    assert payload["mode"] == "viva"
    assert payload["event"] == "live_ws_stop"


def test_absent_context_keys_are_omitted_not_null():
    payload = _format(_record())
    for key in ("session_id", "request_id", "user_id", "mode", "event"):
        assert key not in payload


def test_exceptions_are_rendered_into_exc():
    try:
        raise ValueError("bad rubric")
    except ValueError:
        import sys

        record = _record("boom", logging.ERROR)
        record.exc_info = sys.exc_info()
    payload = _format(record)
    assert "ValueError: bad rubric" in payload["exc"]


def test_unserialisable_values_do_not_break_a_log_line():
    payload = _format(_record(session_id=object()))
    assert "session_id" in payload


# --------------------------------------------------------------------------- #
# The fix: extra fields outside the promotion list used to be dropped silently
# --------------------------------------------------------------------------- #
def test_extra_fields_outside_the_promoted_set_are_no_longer_lost():
    """api/live.py logs reason/reconnects/has_activity on the single richest
    event in the whole live subsystem, and all three were being discarded by
    the promotion whitelist — the log line existed but said nothing useful."""
    payload = _format(
        _record(
            "live session stopped",
            event="live_ws_stop",
            session_id="s1",
            reason="browser_gone",
            reconnects=2,
            has_activity=True,
        )
    )
    # Promoted keys keep their existing top-level position…
    assert payload["session_id"] == "s1"
    assert payload["event"] == "live_ws_stop"
    # …and the rest now survive instead of vanishing.
    assert payload["ctx"]["reason"] == "browser_gone"
    assert payload["ctx"]["reconnects"] == 2
    assert payload["ctx"]["has_activity"] is True


def test_ctx_is_omitted_entirely_when_there_is_nothing_extra():
    """Every existing log line must keep its exact current shape."""
    assert "ctx" not in _format(_record(session_id="s1"))


def test_ctx_never_duplicates_a_promoted_key():
    payload = _format(_record(session_id="s1", reason="x"))
    assert "session_id" not in payload.get("ctx", {})


def test_internal_logrecord_attributes_never_leak_into_ctx():
    payload = _format(_record("m", reason="x"))
    for noisy in ("args", "msg", "levelno", "pathname", "created", "thread"):
        assert noisy not in payload.get("ctx", {})
