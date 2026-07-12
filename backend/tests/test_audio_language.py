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
