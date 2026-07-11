"""Regression test: non-English live sessions must carry a speech language_code.

Root cause of the "configured (regional-language) Mock Viva has no audio" bug:
the half-cascade Live models synthesize speech via TTS, which needs a target
language. Without speech_config.language_code a non-English session produces a
transcript but no audible speech. English must stay unset so the working
English/Coach path is byte-for-byte unchanged.
"""
from __future__ import annotations

import pytest

from ai import live_service
from core.languages import audio_language_code


def test_english_has_no_language_code():
    assert audio_language_code("English") is None
    assert audio_language_code(None) is None
    assert audio_language_code("Klingon") is None


@pytest.mark.parametrize(
    "language,expected",
    [
        ("Telugu", "te-IN"),
        ("Tenglish", "te-IN"),
        ("Hindi", "hi-IN"),
        ("Hinglish", "hi-IN"),
        ("Tamil", "ta-IN"),
        ("Tanglish", "ta-IN"),
        ("Kannada", "kn-IN"),
        ("Malayalam", "ml-IN"),
        ("Marathi", "mr-IN"),
        ("Bengali", "bn-IN"),
        ("Gujarati", "gu-IN"),
        ("Punjabi", "pa-IN"),
        ("telugu", "te-IN"),  # case-insensitive
    ],
)
def test_regional_languages_map_to_bcp47(language, expected):
    assert audio_language_code(language) == expected


def test_build_config_sets_language_code_only_for_non_english():
    en = live_service.build_config("viva", "balanced", "English", "Project X", subject="DBMS")
    assert getattr(en.speech_config, "language_code", None) is None

    te = live_service.build_config("viva", "balanced", "Telugu", "Project X", subject="DBMS")
    assert te.speech_config.language_code == "te-IN"
    # The audio modality must remain set regardless of language.
    assert list(te.response_modalities) == ["AUDIO"]


def test_connect_fallback_strips_language_code():
    te = live_service.build_config("viva", "balanced", "Telugu", "Project X")
    stripped = live_service._config_without_language_code(te)
    assert stripped is not None
    assert getattr(stripped.speech_config, "language_code", None) is None
    # Original config is not mutated.
    assert te.speech_config.language_code == "te-IN"
    # English config has nothing to strip.
    en = live_service.build_config("viva", "balanced", "English", "")
    assert live_service._config_without_language_code(en) is None
