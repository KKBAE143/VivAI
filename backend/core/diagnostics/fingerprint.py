"""Group equivalent errors so a report shows 4 problems, not 400 lines.

Two occurrences of the same bug almost never produce byte-identical text: ids,
timings, ports and paths differ. Fingerprinting normalises those away so the
report can say "this happened 87 times" instead of printing 87 near-duplicates.

Pure and stdlib-only.

KEEP IN SYNC with ``src/diagnostics/fingerprint.ts``.
"""
from __future__ import annotations

import hashlib
import re

FINGERPRINT_LEN = 12

# Variable fragments, replaced with stable placeholders before hashing.
# Order matters: the most specific shapes first.
_NORMALISERS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b"), "<uuid>"),
    (re.compile(r"\b[0-9a-fA-F]{16,}\b"), "<hex>"),
    (re.compile(r"\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?\b"), "<ts>"),
    (re.compile(r"\[redacted[^\]]*\]"), "<redacted>"),
    # Numbers, including ones carrying a unit suffix ("12s", "907ms"). The
    # lookbehind keeps identifiers like `abc123` intact; without allowing a
    # trailing unit, "failed after 12s" and "failed after 907s" fingerprint
    # differently and the same bug splits into a bucket per duration.
    (re.compile(r"(?<![A-Za-z0-9_])\d+(?:\.\d+)?"), "<n>"),
    # Windows and POSIX paths -> keep the basename only; drive letters and
    # checkout directories differ between machines but mean nothing.
    (re.compile(r"[A-Za-z]:\\[^\s\"']+\\([^\\\s\"']+)"), r"<path>/\1"),
    (re.compile(r"(?<![\w.])/(?:[\w.-]+/)+([\w.-]+)"), r"<path>/\1"),
    (re.compile(r"\s+"), " "),
]

# Frames that belong to the runtime or third-party code, not this app.
_VENDOR_MARKERS = (
    "site-packages",
    "lib/python",
    "lib\\python",
    "node_modules",
    "<frozen ",
    "importlib",
    "asyncio/",
    "asyncio\\",
    "/dist/",
    "\\dist\\",
)

_PY_FRAME_RE = re.compile(r'File "([^"]+)", line (\d+), in (\S+)')
_JS_FRAME_RE = re.compile(r"at\s+(?:([^\s(]+)\s+)?\(?([^\s()]+?):(\d+):(\d+)\)?")


def normalize_message(message: str) -> str:
    """Strip the parts of a message that vary between occurrences."""
    if not message:
        return ""
    text = message.strip()
    for pattern, replacement in _NORMALISERS:
        text = pattern.sub(replacement, text)
    return text.strip()[:300]


def _is_app_frame(text: str) -> bool:
    lowered = text.lower()
    return not any(marker in lowered for marker in _VENDOR_MARKERS)


def top_app_frame(stack: str | None) -> str:
    """The most specific frame belonging to this app.

    Vendor frames are skipped: two different bugs both surfacing inside
    ``asyncio/tasks.py`` are different bugs, and grouping them by that frame
    would merge unrelated failures into one useless bucket.
    """
    if not stack:
        return ""
    app_frames: list[str] = []
    for match in _PY_FRAME_RE.finditer(stack):
        path, line, func = match.group(1), match.group(2), match.group(3)
        if _is_app_frame(path):
            app_frames.append(f"{path.replace(chr(92), '/').rsplit('/', 1)[-1]}:{line}:{func}")
    if app_frames:
        # Python tracebacks are outermost-first, so the last app frame is the
        # one that actually raised.
        return app_frames[-1]
    for match in _JS_FRAME_RE.finditer(stack):
        func, path, line = match.group(1) or "?", match.group(2), match.group(3)
        if _is_app_frame(path):
            return f"{path.replace(chr(92), '/').rsplit('/', 1)[-1]}:{line}:{func}"
    return ""


def fingerprint(error_type: str | None, message: str | None, stack: str | None = None) -> str:
    """Stable short id for "this same problem"."""
    parts = [
        (error_type or "").strip(),
        normalize_message(message or ""),
        top_app_frame(stack),
    ]
    digest = hashlib.sha1("|".join(parts).encode("utf-8", "replace")).hexdigest()
    return digest[:FINGERPRINT_LEN]
