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

# Sessions conducted in a blend of English and an Indian language. Distinct from
# both pure English and a pure regional language, because English-derived text
# analysis is PARTLY valid on them: English words are present and measurable, while
# the regional half is not. Anything that would count an absence of something —
# rather than the presence of it — must not treat these as English.
CODE_MIXED_LANGUAGES: tuple[str, ...] = ("Hinglish", "Tenglish", "Tanglish")

def normalize_language(value: str | None) -> str:
    """Return the canonical language label, case-insensitively.

    Falls back to English for None/unknown values so a live session can always
    start rather than 500 on an unrecognized language.
    """
    if not value:
        return _DEFAULT_LANGUAGE
    return _LOOKUP.get(value.strip().lower(), _DEFAULT_LANGUAGE)


def is_english_session(value: str | None) -> bool:
    """Is this session being conducted wholly in English?

    The gate for any text analysis whose vocabulary lists are English — most
    importantly for anything that reports an ABSENCE. Concluding "almost no filler
    words" from an English filler list, on a Telugu answer whose fillers that list
    cannot see, is not a measurement; it is praise the student did not earn.

    Matched on the RAW value, deliberately not through `normalize_language`. That
    function falls back to English so an unrecognised language can still start a
    session; routing this through it would quietly classify every future language as
    English and re-enable exactly the false praise above.
    """
    return (value or "").strip().lower() == "english"


def is_code_mixed_session(value: str | None) -> bool:
    """Is this session an English/Indian-language blend (Hinglish and friends)?

    English words in these ARE measurable, so finding something is trustworthy.
    Failing to find something is not, because half the speech is invisible to an
    English word list.

    Raw-matched for the same reason as `is_english_session`.
    """
    return (value or "").strip().lower() in {lang.lower() for lang in CODE_MIXED_LANGUAGES}
