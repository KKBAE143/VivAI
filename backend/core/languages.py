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

# BCP-47 codes for the Gemini Live speech config (speech_config.language_code).
# The flash-live models are half-cascade (they synthesize speech from text via
# TTS), and that TTS needs a target language. Without it a non-English session
# produces a transcript but NO audible speech. Blended ("-lish") languages map to
# their primary regional code — the prompt handles the English code-mixing, and
# the regional TTS voice renders English loanwords naturally.
#
# English is intentionally ABSENT: for English we leave language_code unset,
# preserving the exact (working) config that Quick Viva / Coach already use — so
# this change cannot regress the English/Coach path.
_LANGUAGE_CODES = {
    "Hindi": "hi-IN",
    "Hinglish": "hi-IN",
    "Telugu": "te-IN",
    "Tenglish": "te-IN",
    "Tamil": "ta-IN",
    "Tanglish": "ta-IN",
    "Kannada": "kn-IN",
    "Malayalam": "ml-IN",
    "Marathi": "mr-IN",
    "Bengali": "bn-IN",
    "Gujarati": "gu-IN",
    "Punjabi": "pa-IN",
}


def normalize_language(value: str | None) -> str:
    """Return the canonical language label, case-insensitively.

    Falls back to English for None/unknown values so a live session can always
    start rather than 500 on an unrecognized language.
    """
    if not value:
        return _DEFAULT_LANGUAGE
    return _LOOKUP.get(value.strip().lower(), _DEFAULT_LANGUAGE)


def audio_language_code(value: str | None) -> str | None:
    """BCP-47 language code for Gemini Live audio synthesis, or None for English.

    Returning None for English (and unknown values) leaves speech_config.language_code
    unset — the current, working default — so only non-English sessions are affected.
    """
    return _LANGUAGE_CODES.get(normalize_language(value))
