"""Supported live-session languages — mirror of src/lib/languages.ts.

This is the belt-and-braces server-side guard (Issue 6). The DB CHECK on
``viva_sessions.language`` is the last line of defense; validating here means a
bad/unknown language is normalized to a safe value BEFORE it reaches the DB,
instead of surfacing as a confusing 500. Keep this list in sync with
``src/lib/languages.ts``.
"""
from __future__ import annotations

SUPPORTED_LANGUAGES: tuple[str, ...] = (
    "English",
    "Hindi",
    "Hinglish",
    "Telugu",
    "Tenglish",
    "Tamil",
    "Tanglish",
    "Kannada",
    "Malayalam",
    "Marathi",
    "Bengali",
    "Gujarati",
    "Punjabi",
)

_DEFAULT_LANGUAGE = "English"
_LOOKUP = {lang.lower(): lang for lang in SUPPORTED_LANGUAGES}

def normalize_language(value: str | None) -> str:
    """Return the canonical language label, case-insensitively.

    Falls back to English for None/unknown values so a live session can always
    start rather than 500 on an unrecognized language.
    """
    if not value:
        return _DEFAULT_LANGUAGE
    return _LOOKUP.get(value.strip().lower(), _DEFAULT_LANGUAGE)
