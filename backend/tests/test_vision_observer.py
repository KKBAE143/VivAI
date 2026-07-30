"""Visual delivery coaching from video frames, replacing the `flag_moment` tool.

Two groups of tests matter here. One is the usual "a failure must be invisible to
the session". The other is narrower and more important: a vision model asked to
comment on a student will volunteer opinions about their face, their clothes and
their room unless it is told not to, and it will invent things it cannot see. Both
are guarded.
"""
from __future__ import annotations

import asyncio
import base64
import json

import pytest

from ai import vision_observer
from api import live as live_api


FRAME = b"\xff\xd8\xff\xe0fake-jpeg-bytes"


def _reply(*observations):
    return {"observations": list(observations)}


def _stub(monkeypatch, value, capture: dict | None = None):
    def fake(prompt, image, mime, default=None, retries=2):
        if capture is not None:
            capture["prompt"] = prompt
            capture["image"] = image
            capture["mime"] = mime
            capture["retries"] = retries
        return value

    monkeypatch.setattr(vision_observer.gemini_service, "generate_json_with_image", fake)


# --------------------------------------------------------------------------- #
# Nothing to say is a valid answer
# --------------------------------------------------------------------------- #
def test_no_frame_means_no_call_and_no_notes():
    assert vision_observer.observe_frame(b"", video_source="camera") == []


def test_an_empty_list_from_the_model_is_respected(monkeypatch):
    """"I cannot see the student clearly" has to be an allowed outcome, or the model
    will manufacture something to fill the space."""
    _stub(monkeypatch, _reply())
    assert vision_observer.observe_frame(FRAME, video_source="camera") == []


def test_a_malformed_reply_produces_nothing(monkeypatch):
    for reply in (None, "not json", {"observations": "nope"}, {}, []):
        _stub(monkeypatch, reply)
        assert vision_observer.observe_frame(FRAME, video_source="camera") == []


def test_a_timeout_produces_nothing(monkeypatch):
    def hang(*a, **k):
        import time

        time.sleep(5)
        return _reply({"dimension": "posture", "kind": "issue", "evidence": "slouching"})

    monkeypatch.setattr(vision_observer.gemini_service, "generate_json_with_image", hang)
    monkeypatch.setattr(vision_observer, "VISION_TIMEOUT_SECONDS", 0.05)
    assert vision_observer.observe_frame(FRAME, video_source="camera") == []


def test_an_exception_produces_nothing(monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("429 RESOURCE_EXHAUSTED")

    monkeypatch.setattr(vision_observer.gemini_service, "generate_json_with_image", boom)
    assert vision_observer.observe_frame(FRAME, video_source="camera") == []


def test_it_asks_once_and_is_bounded():
    """Another frame is along in half a minute, so a retry buys nothing — and an
    unbounded call would outlive the timer that scheduled it."""
    assert vision_observer._RETRIES == 0
    assert 0 < vision_observer.VISION_TIMEOUT_SECONDS <= 15


def test_the_frame_is_sent_as_a_jpeg_with_no_retries(monkeypatch):
    capture: dict = {}
    _stub(monkeypatch, _reply(), capture)
    vision_observer.observe_frame(FRAME, video_source="camera")
    assert capture["image"] == FRAME
    assert capture["mime"] == "image/jpeg"
    assert capture["retries"] == 0


# --------------------------------------------------------------------------- #
# Anything it cannot support is dropped
# --------------------------------------------------------------------------- #
def test_an_observation_with_no_evidence_is_dropped(monkeypatch):
    """The panel is only worth having if a student can trust it."""
    _stub(monkeypatch, _reply({"dimension": "posture", "kind": "issue", "evidence": ""}))
    assert vision_observer.observe_frame(FRAME, video_source="camera") == []


def test_a_dimension_we_did_not_ask_for_is_dropped(monkeypatch):
    """A free-associating vision model is the failure mode here, and an unrecognised
    dimension is the clearest signal of it."""
    _stub(monkeypatch, _reply(
        {"dimension": "attractiveness", "kind": "issue", "evidence": "Something about their face."},
        {"dimension": "wardrobe", "kind": "note", "evidence": "Wearing a plain shirt."},
        {"dimension": "posture", "kind": "issue", "evidence": "Leaning well back in the chair."},
    ))
    observations = vision_observer.observe_frame(FRAME, video_source="camera")
    assert [o["dimension"] for o in observations] == ["posture"]


def test_camera_and_screen_dimensions_do_not_cross_over(monkeypatch):
    """A camera session cannot produce a note about slide readability, and a screen
    share cannot produce one about posture — there is no face in it."""
    _stub(monkeypatch, _reply(
        {"dimension": "readability", "kind": "issue", "evidence": "The text is small."}
    ))
    assert vision_observer.observe_frame(FRAME, video_source="camera") == []

    _stub(monkeypatch, _reply(
        {"dimension": "posture", "kind": "issue", "evidence": "Slouching."}
    ))
    assert vision_observer.observe_frame(FRAME, video_source="screen") == []


def test_at_most_two_notes_come_from_one_frame(monkeypatch):
    _stub(monkeypatch, _reply(
        {"dimension": "posture", "kind": "issue", "evidence": "Leaning back."},
        {"dimension": "eye_contact", "kind": "issue", "evidence": "Looking down."},
        {"dimension": "framing", "kind": "issue", "evidence": "Off to one side."},
        {"dimension": "energy", "kind": "strength", "evidence": "Looks engaged."},
    ))
    observations = vision_observer.observe_frame(FRAME, video_source="camera")
    assert len(observations) == vision_observer.MAX_PER_FRAME


# --------------------------------------------------------------------------- #
# Honesty about what a single frame can support
# --------------------------------------------------------------------------- #
def test_a_frame_observation_is_never_high_confidence(monkeypatch):
    """One frame is one moment. `delivery_observer` earns high confidence because it
    is arithmetic; this is an inference and must not claim the same standing —
    including when the model asserts otherwise."""
    _stub(monkeypatch, _reply(
        {"dimension": "posture", "kind": "issue", "evidence": "Leaning back.",
         "confidence": "high", "severity": "high"},
    ))
    observation = vision_observer.observe_frame(FRAME, video_source="camera")[0]
    assert observation["confidence"] == "medium"
    assert observation["severity"] == "low"


def test_the_prompt_forbids_describing_a_moment_as_a_pattern(monkeypatch):
    capture: dict = {}
    _stub(monkeypatch, _reply(), capture)
    vision_observer.observe_frame(FRAME, video_source="camera")
    assert "ONE MOMENT" in capture["prompt"]
    for word in ("always", "never", "you keep", "throughout"):
        assert word in capture["prompt"]


@pytest.mark.parametrize("source", ["camera", "screen"])
def test_the_prompt_forbids_judging_the_student_personally(monkeypatch, source):
    """The guard that matters most.

    A vision model will comment on a student's face, clothes, and the room they are
    sitting in — which for this platform's students often means their home — unless
    it is explicitly told not to. None of it is delivery, and all of it would make a
    practice session feel like being judged for who you are. Same principle as
    `integrity`, where code-mixing is never a signal.
    """
    capture: dict = {}
    _stub(monkeypatch, _reply(), capture)
    vision_observer.observe_frame(FRAME, video_source=source)
    prompt = capture["prompt"]
    for forbidden in ("appearance", "clothing", "grooming", "gender", "background",
                      "afford", "accent"):
        assert forbidden in prompt, f"{source} rubric does not forbid {forbidden}"


def test_a_tip_is_only_attached_to_an_issue(monkeypatch):
    """"You are sitting well — try sitting up straighter" is incoherent."""
    _stub(monkeypatch, _reply(
        {"dimension": "posture", "kind": "strength", "evidence": "Sitting upright.",
         "tip": "Sit up straighter."},
    ))
    assert "tip" not in vision_observer.observe_frame(FRAME, video_source="camera")[0]

    _stub(monkeypatch, _reply(
        {"dimension": "posture", "kind": "issue", "evidence": "Slouching.",
         "tip": "Sit up straighter."},
    ))
    assert vision_observer.observe_frame(FRAME, video_source="camera")[0]["tip"]


def test_camera_notes_are_body_language_and_screen_notes_are_content(monkeypatch):
    """The category decides where the report can cite it, and the report refuses
    body-language claims when no camera was available."""
    _stub(monkeypatch, _reply(
        {"dimension": "posture", "kind": "issue", "evidence": "Leaning back."}
    ))
    assert vision_observer.observe_frame(FRAME, video_source="camera")[0]["category"] == "body_language"

    _stub(monkeypatch, _reply(
        {"dimension": "readability", "kind": "issue", "evidence": "Text is small."}
    ))
    assert vision_observer.observe_frame(FRAME, video_source="screen")[0]["category"] == "content"


# --------------------------------------------------------------------------- #
# Reaching the live panel, through the real session handler
# --------------------------------------------------------------------------- #
def _image_message() -> dict:
    return {
        "type": "websocket.receive",
        "text": json.dumps({"type": "image", "data": base64.b64encode(FRAME).decode()}),
    }


def test_the_session_never_looks_at_video_it_does_not_have(live_harness, monkeypatch):
    """A viva has no camera and no screen share. Spending a vision call on a session
    with no video would be pure waste."""
    from tests.test_live_reconnect import FakeBrowserSocket, FakeGeminiSession

    calls = []
    monkeypatch.setattr(live_api, "_VISION_INTERVAL_SECONDS", 0.01)
    monkeypatch.setattr(live_api.vision_observer, "observe_frame",
                        lambda *a, **k: calls.append(1) or [])
    monkeypatch.setattr(live_api.live_service, "analyze_transcript",
                        lambda *a, **k: {"questions": [], "overall_score": 50, "summary": "",
                                         "strengths": [], "weaknesses": []})
    monkeypatch.setattr(live_api.report_service, "build_report", lambda **k: None)
    live_harness([FakeGeminiSession(turns=[])])

    socket = FakeBrowserSocket()
    socket.query_params = {"token": "t", "pv": "1"}  # no video

    async def scenario():
        task = asyncio.create_task(live_api.live_ws(socket, "viva", "s1"))
        socket.push(_image_message())
        await asyncio.sleep(0.2)
        socket.push({"type": "websocket.receive", "text": json.dumps({"type": "end"})})
        await asyncio.wait_for(task, timeout=5.0)

    asyncio.run(scenario())
    assert calls == []


def test_coaching_notes_reach_the_panel_from_a_camera_frame(live_harness, monkeypatch):
    from tests.test_live_reconnect import FakeBrowserSocket, FakeGeminiSession

    monkeypatch.setattr(live_api, "_VISION_INTERVAL_SECONDS", 0.02)
    monkeypatch.setattr(live_api.vision_observer, "observe_frame", lambda frame, *, video_source: [
        {"category": "body_language", "dimension": "eye_contact", "kind": "issue",
         "severity": "low", "confidence": "medium",
         "evidence": "Looking down at notes rather than the camera.",
         "tip": "Look at the camera when you make your main point."},
    ])
    monkeypatch.setattr(live_api.live_service, "analyze_transcript",
                        lambda *a, **k: {"questions": [], "overall_score": 50, "summary": "",
                                         "strengths": [], "weaknesses": []})
    monkeypatch.setattr(live_api.report_service, "build_report", lambda **k: None)
    live_harness([FakeGeminiSession(turns=[])])

    socket = FakeBrowserSocket()
    socket.query_params = {"token": "t", "pv": "1", "video": "camera"}

    async def scenario():
        task = asyncio.create_task(live_api.live_ws(socket, "viva", "s1"))
        socket.push(_image_message())
        await asyncio.sleep(0.25)
        socket.push({"type": "websocket.receive", "text": json.dumps({"type": "end"})})
        await asyncio.wait_for(task, timeout=5.0)

    asyncio.run(scenario())

    observations = [
        m for m in socket.sent
        if m.get("type") == "event" and m.get("event") == "observation"
    ]
    assert observations, socket.types_sent()
    assert observations[0]["dimension"] == "eye_contact"
    # Deduped by the existing handler, so one repeated note does not fill the panel.
    assert len(observations) == 1


def test_a_stale_frame_is_not_coached_on(live_harness, monkeypatch):
    """The camera was turned off, or the share stopped. A frame from two minutes ago
    describes a moment that has passed."""
    from tests.test_live_reconnect import FakeBrowserSocket, FakeGeminiSession

    calls = []
    monkeypatch.setattr(live_api, "_VISION_INTERVAL_SECONDS", 0.02)
    monkeypatch.setattr(live_api, "_VISION_FRAME_STALE_SECONDS", 0.01)
    monkeypatch.setattr(live_api.vision_observer, "observe_frame",
                        lambda *a, **k: calls.append(1) or [])
    monkeypatch.setattr(live_api.live_service, "analyze_transcript",
                        lambda *a, **k: {"questions": [], "overall_score": 50, "summary": "",
                                         "strengths": [], "weaknesses": []})
    monkeypatch.setattr(live_api.report_service, "build_report", lambda **k: None)
    live_harness([FakeGeminiSession(turns=[])])

    socket = FakeBrowserSocket()
    socket.query_params = {"token": "t", "pv": "1", "video": "camera"}

    async def scenario():
        task = asyncio.create_task(live_api.live_ws(socket, "viva", "s1"))
        socket.push(_image_message())
        await asyncio.sleep(0.3)  # every interval finds the frame already stale
        socket.push({"type": "websocket.receive", "text": json.dumps({"type": "end"})})
        await asyncio.wait_for(task, timeout=5.0)

    asyncio.run(scenario())
    assert calls == []


def test_a_vision_failure_never_disturbs_the_session(live_harness, monkeypatch):
    from tests.test_live_reconnect import FakeBrowserSocket, FakeGeminiSession

    monkeypatch.setattr(live_api, "_VISION_INTERVAL_SECONDS", 0.02)

    def boom(*a, **k):
        raise RuntimeError("vision exploded")

    monkeypatch.setattr(live_api.vision_observer, "observe_frame", boom)
    monkeypatch.setattr(live_api.live_service, "analyze_transcript",
                        lambda *a, **k: {"questions": [], "overall_score": 50, "summary": "",
                                         "strengths": [], "weaknesses": []})
    monkeypatch.setattr(live_api.report_service, "build_report", lambda **k: None)
    live_harness([FakeGeminiSession(turns=[])])

    socket = FakeBrowserSocket()
    socket.query_params = {"token": "t", "pv": "1", "video": "camera"}

    async def scenario():
        task = asyncio.create_task(live_api.live_ws(socket, "viva", "s1"))
        socket.push(_image_message())
        await asyncio.sleep(0.2)
        socket.push({"type": "websocket.receive", "text": json.dumps({"type": "end"})})
        await asyncio.wait_for(task, timeout=5.0)

    asyncio.run(scenario())
    # The session still reached its normal ending despite vision failing repeatedly.
    assert "aborted" in socket.types_sent() or "finalizing" in socket.types_sent()


def test_the_vision_budget_is_capped():
    """A runaway timer against a paid key is somebody's bill."""
    assert live_api._MAX_VISION_CALLS > 0
    assert live_api._VISION_INTERVAL_SECONDS >= 15
