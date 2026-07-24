---
kind: logging_system
name: Structured JSON logging with Python stdlib and activity persistence
category: logging_system
scope:
    - '**'
source_files:
    - backend/core/logging.py
    - backend/core/errors.py
    - backend/services/activity_service.py
    - backend/api/live.py
---

The backend uses Python's built-in `logging` module to produce structured, single-line JSON log records that are emitted to stdout. The frontend does not use a dedicated logging framework — it relies on the browser console (no custom logger was found in the TS/TSX codebase).

**Backend logging system**
- **Framework**: Python `logging` with a custom `JsonFormatter` (`backend/core/logging.py`). Every record is serialized as one JSON line containing fields `ts`, `level`, `logger`, `msg`; context keys `session_id`, `request_id`, `user_id`, `mode`, `event` are promoted to top-level for filtering; exceptions are attached under `exc`.
- **Initialization**: `configure_logging()` installs a single `StreamHandler(sys.stdout)` on the root logger at level `INFO` and marks itself idempotent via a `_horux_configured` flag. It is called lazily from `get_logger(name)`, which returns namespaced loggers under the `horux.<name>` hierarchy (e.g. `horux.live`, `horux.http`).
- **Sinks**: stdout only — no file handlers, no external aggregator integration, no rotation. Production consumption is expected to be handled by the runtime/container orchestrator.
- **Correlation IDs**: `request_id` is generated per HTTP request in the global catch-all error middleware (`backend/core/errors.py`) and attached to every unhandled-exception log via `logger.exception(..., extra={"request_id": ...})`. `session_id` is a domain concept used across live sessions and promoted through `extra=` calls throughout the live route.
- **PII policy**: A docstring explicitly forbids logging transcript text or user content at INFO — only ids and counts should appear in the log stream.

**Activity feed (separate concern)**
- `services/activity_service.log_activity` persists user-facing audit events into the `activity_log` Supabase table. This is distinct from the structured log stream: it is database-backed, fire-and-forget (exceptions are swallowed so they never break requests), and consumed by the application's activity feed UI rather than log aggregators.

**Frontend**
- No dedicated logging library was found in the TypeScript/React codebase. The only reference to "logging" is a comment describing the Singleton pattern. Frontend diagnostics therefore rely on the browser console and any platform-provided error reporting hooks.