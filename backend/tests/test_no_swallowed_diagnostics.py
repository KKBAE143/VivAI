"""Guard against diagnostics regressing back into the void.

The backend used to carry 27 `print()` calls inside `except` blocks. Each one
described a real failure — a report that could not be built, a live session
that could not be finalized — and each one went to a stdout that
`start-app.ps1` throws away when its console window closes. Converting them to
logger calls is what routes them into the diagnostics sink.

This test exists so the next `print(f"...{exc}")` is caught in review rather
than discovered months later by its absence.
"""
from __future__ import annotations

import ast
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]

# The only legitimate bare prints: they run *while* logging is being configured
# or torn down, so the logger is not safe to use at that moment.
ALLOWED = {
    ("core/logging.py", "_diagnostics_handlers"),
    ("main.py", "lifespan"),
}

# Command-line entry points legitimately print to the user's terminal — that IS
# their output, not a swallowed diagnostic.
ALLOWED_FILES = {"core/diagnostics/__main__.py"}

SKIP_DIRS = {".venv", "__pycache__", "tests", "migrations"}


def _iter_source_files():
    for path in BACKEND.rglob("*.py"):
        if any(part in SKIP_DIRS for part in path.relative_to(BACKEND).parts):
            continue
        yield path


def _enclosing_function(tree: ast.AST, lineno: int) -> str:
    best = "<module>"
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if node.lineno <= lineno <= (node.end_lineno or node.lineno):
                best = node.name
    return best


def test_no_bare_print_calls_remain_in_backend_source():
    offenders: list[str] = []
    for path in _iter_source_files():
        rel = path.relative_to(BACKEND).as_posix()
        if rel in ALLOWED_FILES:
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Name)
                and node.func.id == "print"
            ):
                if (rel, _enclosing_function(tree, node.lineno)) in ALLOWED:
                    continue
                offenders.append(f"{rel}:{node.lineno}")
    assert not offenders, (
        "these print() calls send diagnostics to a console window that gets "
        "closed; use logger.warning(..., exc_info=True, extra={'event': ...}) "
        f"instead: {offenders}"
    )


def test_every_module_that_logs_uses_the_namespaced_logger():
    """`get_logger` namespaces under `horux.*` and installs the JSON formatter
    plus the diagnostics handler. A bare `logging.getLogger(__name__)` lands
    outside that namespace and is easy to miss when filtering."""
    # core/logging.py and core/diagnostics/* are the implementation of the
    # convention, so they necessarily call the stdlib directly.
    exempt = {"core/logging.py"}
    offenders = [
        rel
        for path in _iter_source_files()
        if (rel := path.relative_to(BACKEND).as_posix()) not in exempt
        and not rel.startswith("core/diagnostics/")
        and "logging.getLogger(" in path.read_text(encoding="utf-8")
    ]
    assert not offenders, (
        "use core.logging.get_logger so the module lands in the horux.* "
        f"namespace and reaches the diagnostics sink: {offenders}"
    )
