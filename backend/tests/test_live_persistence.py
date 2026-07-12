from api.live import LivePersistence, coalesce_turns


def test_coalesce_turns_merges_stream_fragments_with_timing():
    turns = coalesce_turns([
        {"role": "examiner", "text": "Hello", "ts_ms": 100},
        {"role": "examiner", "text": "there", "ts_ms": 200},
        {"role": "student", "text": "Hi", "ts_ms": 400},
    ])
    assert turns == [
        {"role": "examiner", "text": "Hello there", "start_ms": 100, "end_ms": 200},
        {"role": "student", "text": "Hi", "start_ms": 400, "end_ms": 400},
    ]


def test_observation_dedup_drops_same_dimension_and_kind_inside_window():
    persistence = LivePersistence("coach", "s", "u", None)
    first = persistence.on_tool("log_observation", {"category": "voice", "dimension": "pace", "kind": "issue", "severity": "low", "confidence": "high", "evidence": "Speech rushed."})
    second = persistence.on_tool("log_observation", {"category": "voice", "dimension": "pace", "kind": "issue", "severity": "low", "confidence": "high", "evidence": "Still rushed."})
    assert first and first["event"] == "observation"
    assert second is None
