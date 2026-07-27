"""Bridge from Python logging into the diagnostics sink.

Attaching at the logging layer rather than instrumenting call sites is what
makes this cheap: converting a swallowed ``print(f"[live] failed: {exc}")`` into
``logger.warning("failed", exc_info=True)`` is then enough to upgrade a line
that vanished into a closed console window into a persisted, fingerprinted,
stack-carrying record. No per-site diagnostics wiring is needed anywhere.

The handler runs behind a ``QueueHandler``/``QueueListener`` pair. That is not
an optimisation — log records are emitted from inside async request and
WebSocket handlers, and a synchronous disk write there would stall the event
loop for every live audio frame in flight.
"""
from __future__ import annotations

import logging
import queue
import threading
import traceback
from logging.handlers import QueueHandler, QueueListener

from core.diagnostics import context as _context
from core.diagnostics import fingerprint as _fp
from core.diagnostics.sink import JsonlSink

# Fields promoted from `extra={...}` into the event's `context` object.
#
# An ALLOWLIST, not a blocklist: anything unrecognised is dropped rather than
# redacted. A regex-only filter fails OPEN on a shape it has not seen; this
# fails closed, which is the behaviour you want standing between a log call and
# a file on disk.
CONTEXT_ALLOWLIST = frozenset(
    {
        "route",
        "url_path",
        "method",
        "status",
        "feature",
        "component",
        "mode",
        "ws_code",
        "duration_ms",
        "query_key",
        "mutation_key",
        "retry_count",
        "attempt",
        "reason",
        "swallowed",
        "tag",
        "has_activity",
        "reconnects",
        "resumable",
        "frames",
        "questions",
        "turns",
        "model",
        "time_left",
    }
)

# LogRecord attributes that are structural, not caller-supplied context.
_STD_RECORD_ATTRS = frozenset(
    {
        "args", "asctime", "created", "exc_info", "exc_text", "filename", "funcName",
        "levelname", "levelno", "lineno", "message", "module", "msecs", "msg", "name",
        "pathname", "process", "processName", "relativeCreated", "stack_info",
        "taskName", "thread", "threadName",
    }
)


class DiagnosticsHandler(logging.Handler):
    """Turn a LogRecord into a sink event. Never propagates a failure."""

    def __init__(self, sink: JsonlSink, level: int = logging.WARNING) -> None:
        super().__init__(level=level)
        self.sink = sink

    def emit(self, record: logging.LogRecord) -> None:
        try:
            self.sink.write(record_to_event(record))
        except Exception:  # noqa: BLE001 — logging must never break the caller
            try:
                self.handleError(record)
            except Exception:  # noqa: BLE001
                pass


# Stacks get their own budget, larger than a normal string, because a
# traceback is the single most useful thing in the whole record.
MAX_STACK_CHARS = 6000


def trim_stack(stack: str, max_chars: int = MAX_STACK_CHARS) -> str:
    """Shorten a traceback by dropping the MIDDLE, never the tail.

    A Python traceback ends with the actual exception line and the frame that
    raised it — the two most important lines in the record. Plain tail
    truncation cuts exactly those, leaving a wall of framework frames and no
    error. The middle is where the vendor plumbing lives, so that is what goes.
    """
    if len(stack) <= max_chars:
        return stack
    head_budget = max_chars // 3
    tail_budget = max_chars - head_budget
    lines = stack.splitlines(keepends=True)

    head: list[str] = []
    size = 0
    for line in lines:
        if size + len(line) > head_budget:
            break
        head.append(line)
        size += len(line)

    tail: list[str] = []
    size = 0
    for line in reversed(lines[len(head) :]):
        if size + len(line) > tail_budget:
            break
        tail.append(line)
        size += len(line)
    tail.reverse()

    dropped = len(lines) - len(head) - len(tail)
    return "".join(head) + f"\n  … {dropped} intermediate frames omitted …\n\n" + "".join(tail)


def record_to_event(record: logging.LogRecord) -> dict:
    """Build the JSONL envelope for one log record."""
    ctx = _context.current_context()

    error: dict | None = None
    stack = None
    if record.exc_info and record.exc_info[0] is not None:
        exc_type, exc_value, exc_tb = record.exc_info
        stack = trim_stack("".join(traceback.format_exception(exc_type, exc_value, exc_tb)))
        error = {
            "type": getattr(exc_type, "__name__", str(exc_type)),
            "message": str(exc_value),
            "stack": stack,
        }

    context = {
        key: value
        for key, value in record.__dict__.items()
        if key in CONTEXT_ALLOWLIST and value is not None
    }
    if ctx.get("route") and "route" not in context:
        context["route"] = ctx["route"]

    try:
        message = record.getMessage()
    except Exception:  # noqa: BLE001 — a bad %-format must not lose the event
        message = str(record.msg)

    return {
        "source": "backend",
        "kind": "exception" if error else "log",
        "level": record.levelname,
        "logger": record.name,
        "message": message,
        "run_id": ctx.get("run_id"),
        "request_id": getattr(record, "request_id", None) or ctx.get("request_id"),
        "session_id": getattr(record, "session_id", None) or ctx.get("session_id"),
        # Tracing: ties this line to the browser action that ultimately caused
        # it, across the API call, the WebSocket and the Gemini call inside it.
        "trace_id": ctx.get("trace_id"),
        "span_id": ctx.get("span_id"),
        "parent_span_id": ctx.get("parent_span_id"),
        "event": getattr(record, "event", None),
        "fingerprint": _fp.fingerprint(
            (error or {}).get("type") or record.name,
            message,
            stack,
        ),
        **({"error": error} if error else {}),
        **({"context": context} if context else {}),
    }


class PassthroughQueueHandler(QueueHandler):
    """A QueueHandler that does NOT pre-format the record.

    The stdlib ``prepare()`` renders the record to a string, assigns it to
    ``msg``, and then sets ``exc_info = None`` — which is designed for
    multiprocessing queues where a traceback object cannot be pickled. Here the
    queue is in-process, and that behaviour destroyed exactly what we came for:
    the handler downstream saw a pre-rendered blob with the traceback glued into
    the message and no exception info at all, so every captured error lost its
    structured ``error.type`` / ``error.stack`` and fingerprinted on 300
    truncated characters of stack text.
    """

    def prepare(self, record: logging.LogRecord) -> logging.LogRecord:  # noqa: D102
        return record


class _Bridge:
    """Owns the queue + listener so shutdown can stop the thread."""

    def __init__(self) -> None:
        self.queue: queue.Queue | None = None
        self.listener: QueueListener | None = None
        self.sink: JsonlSink | None = None
        self._lock = threading.Lock()

    def start(self, sink: JsonlSink, level: int) -> QueueHandler | None:
        with self._lock:
            if self.listener is not None:
                return None  # already running (uvicorn --reload re-imports)
            self.sink = sink
            # Bounded: a runaway loop must drop records, not exhaust memory.
            self.queue = queue.Queue(maxsize=10_000)
            handler = DiagnosticsHandler(sink, level=level)
            # daemon=True matters: uvicorn --reload restarts the process
            # constantly and a non-daemon thread would hang the reloader.
            self.listener = QueueListener(self.queue, handler, respect_handler_level=True)
            self.listener.daemon = True
            self.listener.start()
            queue_handler = PassthroughQueueHandler(self.queue)
            queue_handler.setLevel(level)
            return queue_handler

    def stop(self) -> None:
        with self._lock:
            try:
                if self.listener is not None:
                    self.listener.stop()
            except Exception:  # noqa: BLE001
                pass
            finally:
                self.listener = None
            try:
                if self.sink is not None:
                    self.sink.close()
            except Exception:  # noqa: BLE001
                pass
            finally:
                self.sink = None
                self.queue = None


bridge = _Bridge()
