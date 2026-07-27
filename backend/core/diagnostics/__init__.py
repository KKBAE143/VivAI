"""Local diagnostics capture.

Writes redacted error events to ``<repo>/diagnostics/backend/*.jsonl`` so a
failure can be handed over as a file instead of remembered. The directory is
gitignored; ``diagnose.bat`` renders a Markdown digest from it.

Everything here is fail-open by construction: the worst outcome this subsystem
is allowed to cause is "no diagnostics", never "no app".

Public surface only — import internals from their own modules.
"""
from __future__ import annotations

import logging
import sys

from core.diagnostics.context import current_context, reset_context, set_context

__all__ = [
    "capture",
    "current_context",
    "install_runtime_hooks",
    "reset_context",
    "set_context",
    "shutdown",
]

logger = logging.getLogger("horux.diagnostics")

_installed = False


def capture(message: str, *, level: int = logging.WARNING, **context) -> None:
    """Record a diagnostic event from application code.

    A thin wrapper over the logger, so capture always travels the same path as
    every other log line — one code path to reason about, one place to filter.
    """
    try:
        logger.log(level, message, exc_info=sys.exc_info()[0] is not None, extra=context)
    except Exception:  # noqa: BLE001
        pass


def install_runtime_hooks() -> None:
    """Catch failures that never reach a logger on their own.

    The valuable one is the asyncio handler: a background task that raises and
    is never awaited prints "Task exception was never retrieved" to stderr and
    is otherwise invisible. The live-session code runs several such tasks per
    session (receive loop, audio pump, mic-gate safety), so this is exactly
    where its silent deaths show up.
    """
    global _installed
    if _installed:
        return
    from core.config import get_settings

    if not get_settings().diagnostics_enabled:
        return

    import asyncio

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        # No running loop (imported outside a server). Nothing to hook.
        loop = None

    if loop is not None:
        previous = loop.get_exception_handler()

        def handle(loop_, ctx):
            try:
                exc = ctx.get("exception")
                logger.warning(
                    ctx.get("message") or "unhandled asyncio exception",
                    exc_info=exc if exc else None,
                    extra={"event": "asyncio_unhandled"},
                )
            except Exception:  # noqa: BLE001
                pass
            # Chain, never replace — the default handler is what prints the
            # traceback to the console the developer is watching.
            if previous is not None:
                previous(loop_, ctx)
            else:
                loop_.default_exception_handler(ctx)

        loop.set_exception_handler(handle)

    _installed = True
    logger.info("diagnostics capture active", extra={"event": "diagnostics_start"})


def shutdown() -> None:
    """Flush and stop the background writer. Safe to call more than once."""
    global _installed
    _installed = False
    try:
        from core.diagnostics.handler import bridge

        bridge.stop()
    except Exception:  # noqa: BLE001
        pass
