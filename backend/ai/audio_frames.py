"""Tagged audio frames for multi-speaker rooms.

Until now every binary frame a Team Viva client received was assumed to be AI
speech at 24 kHz. That assumption is fine while only the AI ever speaks, but the
room now relays HUMAN voice too — student mics are PCM16 at 16 kHz, and a 16 kHz
frame played back at 24 kHz is audibly chipmunked. So each frame carries a small
header saying what it is.

Wire format (little-endian), 12 bytes then raw PCM:

    magic   2 bytes   b"HX"
    version 1 byte    FRAME_VERSION
    kind    1 byte    KIND_AI | KIND_HUMAN
    rate    4 bytes   uint32 sample rate in Hz
    speaker 4 bytes   uint32 length of the speaker id that follows the header

Old clients never see any of this: the room only tags frames for clients that
negotiated protocol version >= 1 (see `pv` on the WebSocket), exactly the seam
`api/live.py` already uses for its mic gate.
"""
from __future__ import annotations

import struct

MAGIC = b"HX"
FRAME_VERSION = 1

KIND_AI = 0
KIND_HUMAN = 1

# Gemini Live speaks at 24 kHz; browser mic capture is 16 kHz.
AI_SAMPLE_RATE = 24000
HUMAN_SAMPLE_RATE = 16000

_HEADER = struct.Struct("<2sBBII")
HEADER_SIZE = _HEADER.size


class FrameError(ValueError):
    """A frame that is not a valid tagged frame."""


def encode(payload: bytes, *, kind: int, sample_rate: int, speaker_id: str = "") -> bytes:
    """Wrap raw PCM in a tagged frame.

    `speaker_id` is carried so the UI can show who is talking without a second
    round trip through a JSON message that could arrive out of order with the
    audio it describes.
    """
    if kind not in (KIND_AI, KIND_HUMAN):
        raise FrameError(f"unknown frame kind: {kind}")
    speaker = speaker_id.encode("utf-8")
    return _HEADER.pack(MAGIC, FRAME_VERSION, kind, sample_rate, len(speaker)) + speaker + payload


def encode_ai(payload: bytes) -> bytes:
    return encode(payload, kind=KIND_AI, sample_rate=AI_SAMPLE_RATE)


def encode_human(payload: bytes, speaker_id: str) -> bytes:
    return encode(payload, kind=KIND_HUMAN, sample_rate=HUMAN_SAMPLE_RATE, speaker_id=speaker_id)


def decode(frame: bytes) -> dict:
    """Parse a tagged frame. Raises FrameError on anything malformed.

    Exists mainly so the encoder has a round-trip test — the browser has its own
    decoder in TypeScript — but also lets a server-side consumer read frames
    without duplicating the struct layout.
    """
    if len(frame) < HEADER_SIZE:
        raise FrameError("frame shorter than its header")
    magic, version, kind, rate, speaker_len = _HEADER.unpack_from(frame, 0)
    if magic != MAGIC:
        raise FrameError("not a tagged audio frame")
    if version != FRAME_VERSION:
        raise FrameError(f"unsupported frame version: {version}")
    if kind not in (KIND_AI, KIND_HUMAN):
        raise FrameError(f"unknown frame kind: {kind}")
    start = HEADER_SIZE
    end = start + speaker_len
    if end > len(frame):
        raise FrameError("speaker id runs past the end of the frame")
    return {
        "kind": kind,
        "sample_rate": rate,
        "speaker_id": frame[start:end].decode("utf-8"),
        "payload": frame[end:],
    }
