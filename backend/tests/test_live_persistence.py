from api.live import LivePersistence, coalesce_turns, resolve_viva_scenario_id
from ai.registry import get_scenario


def test_viva_scenario_resolution_differentiates_by_session_type():
    assert resolve_viva_scenario_id("Subject") == "subject_viva"
    assert resolve_viva_scenario_id("Project") == "viva_defense"
    assert resolve_viva_scenario_id("General") == "general_viva"
    assert resolve_viva_scenario_id(None) == "viva_defense"  # safe default
    assert resolve_viva_scenario_id("unknown-legacy-value") == "viva_defense"
    # And each resolved id must actually exist in the registry with its own
    # coaching emphasis (not silently aliasing to the same object).
    subject, project, general = get_scenario("subject_viva"), get_scenario("viva_defense"), get_scenario("general_viva")
    assert subject and project and general
    assert len({subject.id, project.id, general.id}) == 3


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


def test_observation_dedup_drops_literal_repeats_but_keeps_distinct_evidence():
    """Dedup must only catch the model repeating itself verbatim — two real,
    distinct observations that happen to share a dimension+kind close
    together were previously silently dropped (the "observations disappear"
    bug); they must now both survive."""
    persistence = LivePersistence("coach", "s", "u", None)
    first = persistence.on_tool("log_observation", {"category": "voice", "dimension": "pace", "kind": "issue", "severity": "low", "confidence": "high", "evidence": "Speaking too fast during the intro."})
    literal_repeat = persistence.on_tool("log_observation", {"category": "voice", "dimension": "pace", "kind": "issue", "severity": "low", "confidence": "high", "evidence": "Speaking too fast during the intro."})
    distinct = persistence.on_tool("log_observation", {"category": "voice", "dimension": "pace", "kind": "issue", "severity": "low", "confidence": "high", "evidence": "Rushed through the technical explanation."})

    assert first and first["event"] == "observation"
    assert literal_repeat is None
    assert distinct and distinct["event"] == "observation"
    assert len(persistence.observations) == 2


def test_record_question_and_score_response_correlate_by_id():
    """score_response should attach to the question named by question_id, not
    just "whatever was asked most recently" — the old heuristic misattributed
    scores when the model asked two questions before scoring either."""
    persistence = LivePersistence("viva", "s", "u", None)
    q1 = persistence.on_tool("record_question", {"question": "What is a primary key?"})
    q2 = persistence.on_tool("record_question", {"question": "What is a foreign key?"})
    assert q1["id"] != q2["id"]

    # Score the FIRST question explicitly, even though it was asked earlier.
    scored = persistence.on_tool("score_response", {"score": 90, "feedback": "Clear.", "question_id": q1["id"]})
    assert scored["id"] == q1["id"]
    assert persistence.questions[0]["score"] == 90
    assert persistence.questions[1]["score"] is None  # untouched
