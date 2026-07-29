"""Tagged audio frames.

The bug this format prevents: a 16 kHz student mic frame played back at the AI's
24 kHz sounds chipmunked, and before tagging there was no way for a client to
tell the two apart.
"""
from __future__ import annotations

import pytest

from ai import audio_frames as af


def test_ai_frames_round_trip_at_24k():
    out = af.decode(af.encode_ai(b"\x01\x02\x03"))
    assert out["kind"] == af.KIND_AI
    assert out["sample_rate"] == 24000
    assert out["payload"] == b"\x01\x02\x03"
    assert out["speaker_id"] == ""


def test_human_frames_round_trip_at_16k_and_name_the_speaker():
    out = af.decode(af.encode_human(b"\xaa\xbb", "profile-42"))
    assert out["kind"] == af.KIND_HUMAN
    assert out["sample_rate"] == 16000
    assert out["payload"] == b"\xaa\xbb"
    # Carried in the frame itself so the UI cannot show the wrong speaker due to
    # a JSON message arriving out of order with the audio it describes.
    assert out["speaker_id"] == "profile-42"


def test_a_unicode_speaker_id_survives():
    out = af.decode(af.encode_human(b"\x00", "student-éł"))
    assert out["speaker_id"] == "student-éł"


def test_an_empty_payload_is_valid():
    """A zero-length chunk must not be mistaken for a malformed frame."""
    assert af.decode(af.encode_ai(b""))["payload"] == b""


def test_untagged_audio_is_rejected_rather_than_misread():
    with pytest.raises(af.FrameError):
        af.decode(b"raw pcm with no header at all")


def test_a_truncated_frame_is_rejected():
    frame = af.encode_human(b"\x01\x02", "abc")
    with pytest.raises(af.FrameError):
        af.decode(frame[:6])


def test_a_lying_speaker_length_is_rejected():
    """Never read past the buffer because a header claimed a longer name."""
    bad = af._HEADER.pack(af.MAGIC, af.FRAME_VERSION, af.KIND_HUMAN, 16000, 99) + b"ab"
    with pytest.raises(af.FrameError):
        af.decode(bad)


def test_an_unknown_version_is_rejected_not_guessed():
    bad = af._HEADER.pack(af.MAGIC, 99, af.KIND_AI, 24000, 0)
    with pytest.raises(af.FrameError):
        af.decode(bad)


def test_an_unknown_kind_is_rejected_on_both_ends():
    with pytest.raises(af.FrameError):
        af.encode(b"x", kind=7, sample_rate=16000)
    bad = af._HEADER.pack(af.MAGIC, af.FRAME_VERSION, 7, 16000, 0)
    with pytest.raises(af.FrameError):
        af.decode(bad)


def test_the_header_is_small_enough_to_send_per_chunk():
    # Realtime audio ships ~50 frames/sec/speaker; a fat header would be real
    # bandwidth. 12 bytes is noise next to a 20ms PCM16 chunk (~640 bytes).
    assert af.HEADER_SIZE == 12
