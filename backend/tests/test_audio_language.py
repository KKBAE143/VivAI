"""Regression coverage for audio delivery in every Live-session variant."""
from __future__ import annotations

from types import SimpleNamespace

from ai import live_service
from api.live import _response_audio_chunks


def test_quick_viva_project_viva_and_coach_always_request_native_audio():
    """All user-facing flows must use one valid native-audio configuration."""
    flows = (
        ("viva", "English", "", "DBMS"),  # Quick Mock Viva
        ("viva", "Telugu", "Title: Capstone. Tech stack: Python.", None),  # configured Project Viva
        ("coach", "Hinglish", "", "HR Interview"),  # AI Coach
    )
    for mode, language, project_context, subject in flows:
        config = live_service.build_config(mode, "balanced", language, project_context, subject=subject)
        assert config.speech_config is not None
        assert config.speech_config.language_code is None
        assert list(config.response_modalities) == ["AUDIO"]


def test_transcription_language_hints_anchor_english_only_sessions():
    """English-only sessions still get an explicit en-US hint (an anchor
    beats none) so STT doesn't drift to an unrelated script mid-session."""
    assert live_service._transcription_language_hints("English") == ["en-US"]
    assert live_service._transcription_language_hints("") == ["en-US"]


def test_transcription_language_hints_cover_regional_and_blended_languages():
    """Regression guard for 'transcription shows a different language/
    characters' — pure regional and code-mixed sessions must hint BOTH the
    regional code and en-US, since students routinely mix in English terms."""
    assert live_service._transcription_language_hints("Hindi") == ["hi-IN", "en-US"]
    assert live_service._transcription_language_hints("Telugu") == ["te-IN", "en-US"]
    assert live_service._transcription_language_hints("Tenglish") == ["te-IN", "en-US"]
    assert live_service._transcription_language_hints("Hinglish") == ["hi-IN", "en-US"]
    assert live_service._transcription_language_hints("Tanglish") == ["ta-IN", "en-US"]


def test_build_config_wires_language_hints_into_input_transcription():
    """End-to-end guard: the hints actually reach the SDK config object,
    not just the pure helper function."""
    config = live_service.build_config("viva", "balanced", "Telugu", "", subject="DBMS")
    assert config.input_audio_transcription is not None
    assert config.input_audio_transcription.language_codes == ["te-IN", "en-US"]

    config_en = live_service.build_config("viva", "balanced", "English", "", subject="DBMS")
    assert config_en.input_audio_transcription.language_codes == ["en-US"]


def test_build_config_vad_silence_duration_tolerates_mid_answer_pauses():
    """Regression guard: the AI must not interrupt a student mid-answer.
    900ms was short enough that a natural thinking-pause mid-sentence was
    read as end-of-turn; 1500ms gives real pauses room without going stale."""
    config = live_service.build_config("viva", "balanced", "English", "", subject="DBMS")
    vad = config.realtime_input_config.automatic_activity_detection
    assert vad.silence_duration_ms == 1500


def test_current_sdk_model_turn_audio_is_forwarded_to_the_browser():
    response = SimpleNamespace(
        data=None,
        server_content=SimpleNamespace(
            model_turn=SimpleNamespace(
                parts=[
                    SimpleNamespace(inline_data=SimpleNamespace(data=b"pcm-1", mime_type="audio/pcm;rate=24000")),
                    SimpleNamespace(inline_data=SimpleNamespace(data=b"ignore", mime_type="image/jpeg")),
                    SimpleNamespace(inline_data=None),
                ]
            )
        ),
    )

    assert _response_audio_chunks(response) == [b"pcm-1"]


def test_legacy_audio_data_stays_supported_without_double_forwarding():
    response = SimpleNamespace(
        data=b"legacy-pcm",
        server_content=SimpleNamespace(
            model_turn=SimpleNamespace(
                parts=[SimpleNamespace(inline_data=SimpleNamespace(data=b"same", mime_type="audio/pcm"))]
            )
        ),
    )

    assert _response_audio_chunks(response) == [b"legacy-pcm"]
