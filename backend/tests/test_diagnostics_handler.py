"""The logging -> sink bridge.

The whole design rests on attaching at the logging layer, so the record must
arrive at the sink with its exception intact. It is easy for this to look like
it works while quietly degrading to a formatted string.
"""
from __future__ import annotations

import json
import logging
import time

from core.diagnostics.handler import DiagnosticsHandler, PassthroughQueueHandler, record_to_event
from core.diagnostics.sink import JsonlSink


def _raise_and_record(level: int = logging.ERROR) -> logging.LogRecord:
    logger = logging.getLogger("horux.test_handler")
    try:
        raise ValueError("report build failed")
    except ValueError:
        import sys

        record = logger.makeRecord(
            "horux.test_handler", level, __file__, 10, "report build failed", None, sys.exc_info()
        )
    return record


def test_an_exception_becomes_a_structured_error_not_a_blob():
    event = record_to_event(_raise_and_record())
    assert event["kind"] == "exception"
    assert event["error"]["type"] == "ValueError"
    assert event["error"]["message"] == "report build failed"
    assert "Traceback" in event["error"]["stack"]
    # The message stays the message; the stack does not get glued into it.
    assert "Traceback" not in event["message"]


def test_extra_context_is_allowlisted_not_copied_wholesale():
    logger = logging.getLogger("horux.test_handler")
    record = logger.makeRecord(
        "horux.test_handler", logging.WARNING, __file__, 10, "stopped", None, None
    )
    record.reason = "browser_gone"  # allowlisted
    record.reconnects = 2  # allowlisted
    record.transcript = "the student said something private"  # NOT allowlisted
    event = record_to_event(record)
    assert event["context"]["reason"] == "browser_gone"
    assert event["context"]["reconnects"] == 2
    assert "transcript" not in event["context"], "unrecognised fields must be dropped, not kept"


def test_the_same_failure_from_two_calls_shares_a_fingerprint():
    a = record_to_event(_raise_and_record())
    b = record_to_event(_raise_and_record())
    assert a["fingerprint"] == b["fingerprint"]


def test_the_queue_handler_preserves_exception_info(tmp_path):
    """Regression: the stdlib QueueHandler pre-renders the record and clears
    exc_info (it is built for pickling across processes). That silently turned
    every captured error into a formatted blob with no error.type or
    error.stack, and made fingerprints collide on truncated stack text."""
    import queue as _queue
    from logging.handlers import QueueListener

    q: _queue.Queue = _queue.Queue()
    sink = JsonlSink(tmp_path)
    listener = QueueListener(q, DiagnosticsHandler(sink), respect_handler_level=True)
    listener.start()
    try:
        PassthroughQueueHandler(q).emit(_raise_and_record())
        deadline = time.time() + 5
        while not q.empty() and time.time() < deadline:
            time.sleep(0.01)
        time.sleep(0.2)
    finally:
        listener.stop()
        sink.close()

    lines = [
        json.loads(line)
        for path in tmp_path.glob("*.jsonl")
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    assert lines, "nothing reached the sink"
    event = lines[0]
    assert event["kind"] == "exception"
    assert event["error"]["type"] == "ValueError"
    assert "Traceback" in event["error"]["stack"]


def test_a_bad_format_string_does_not_lose_the_event():
    logger = logging.getLogger("horux.test_handler")
    record = logger.makeRecord(
        "horux.test_handler", logging.WARNING, __file__, 10, "value is %s and %s", ("only-one",), None
    )
    event = record_to_event(record)
    assert event["message"]


def test_handler_emit_never_raises(tmp_path):
    class ExplodingSink(JsonlSink):
        def write(self, event):  # noqa: D102
            raise RuntimeError("disk on fire")

    handler = DiagnosticsHandler(ExplodingSink(tmp_path))
    handler.emit(_raise_and_record())  # must not propagate
