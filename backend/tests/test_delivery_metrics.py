from ai.delivery_metrics import from_transcript


def test_timestamped_transcript_metrics_use_only_available_timings():
    metrics = from_transcript([
        {"role": "examiner", "text": "Tell me about your project", "start_ms": 0, "end_ms": 2_000},
        {"role": "student", "text": "Um, I built a scheduling app with React and FastAPI.", "start_ms": 3_000, "end_ms": 8_000},
        {"role": "examiner", "text": "Why that architecture?", "start_ms": 9_000, "end_ms": 10_000},
        {"role": "student", "text": "It keeps the API simple and scalable.", "start_ms": 12_000, "end_ms": 16_000},
    ])
    assert metrics["available"] is True
    assert metrics["turn_count"] == 2
    assert metrics["filler_total"] == 1
    assert metrics["avg_response_latency_ms"] == 1_500
    assert metrics["longest_monologue_ms"] == 5_000
    assert metrics["avg_wpm"] is not None


def test_timestamped_metrics_are_honest_without_student_turns():
    metrics = from_transcript([{"role": "examiner", "text": "Hello", "start_ms": 0, "end_ms": 1_000}])
    assert metrics["available"] is False
    assert metrics["avg_wpm"] is None
