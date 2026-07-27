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


def test_instantaneous_turns_do_not_crash_the_report():
    """Regression: a short session yields turns whose start_ms == end_ms
    (coalesce_turns collapses a single transcript fragment to a point in time).
    The talk_ratio guard checked that intervals EXISTED rather than that they
    summed to a non-zero duration, so this raised ZeroDivisionError — and
    because finalize() computed metrics outside a try/except, that destroyed
    the student's entire graded report."""
    metrics = from_transcript([
        {"role": "examiner", "text": "First question?", "start_ms": 1_000, "end_ms": 1_000},
        {"role": "student", "text": "Indexes speed up lookups.", "start_ms": 4_000, "end_ms": 4_000},
    ])
    assert metrics["available"] is True
    assert metrics["turn_count"] == 1
    # No duration was observed, so the ratio is honestly unknown — not zero.
    assert metrics["talk_ratio"] is None
    assert metrics["longest_monologue_ms"] == 0


def test_talk_ratio_is_still_computed_when_durations_are_real():
    metrics = from_transcript([
        {"role": "examiner", "text": "Go on", "start_ms": 0, "end_ms": 2_000},
        {"role": "student", "text": "I built a scheduler", "start_ms": 2_000, "end_ms": 8_000},
    ])
    assert metrics["talk_ratio"] == 0.75
