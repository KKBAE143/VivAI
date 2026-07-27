"""`/ws/sentiment/{session_id}` was unauthenticated AND destructive.

Two independent bugs lived in this one handler:

1. No authentication and no ownership check. Anyone who knew or guessed a
   `presentation_sessions` UUID could connect — and the handler WRITES.
2. The write replaced `topic_scores` wholesale. That column is a shared blob:
   `LivePersistence.finalize()` stores `slides`, `topics`, `qa` and the
   generated `report` in it. So even a legitimate sentiment run erased a
   completed presentation's whole report.
"""
from __future__ import annotations

import ast
import json
from pathlib import Path

import pytest

from api.advanced import _merge_sentiment_state

BACKEND = Path(__file__).resolve().parents[1]


# --------------------------------------------------------------------------- #
# 2. The destructive write
# --------------------------------------------------------------------------- #
def test_sentiment_data_does_not_erase_a_generated_report():
    """The exact regression: a student completes a presentation (report stored
    in topic_scores), then runs a sentiment session, and the report vanishes."""
    finalized = {
        "slides": [{"n": 1}],
        "topics": {"Auth": 72},
        "qa": [{"question": "Why JWT?", "score": 80}],
        "report": {"scores": {"overall": 74}},
        "subject": "Campus app",
    }
    merged = _merge_sentiment_state(finalized, [{"confidence": 0.8}], [{"message": "Slow down"}])

    # New data present…
    assert merged["samples"] == [{"confidence": 0.8}]
    assert merged["nudges"] == [{"message": "Slow down"}]
    # …and nothing the report depends on was dropped.
    assert merged["report"] == {"scores": {"overall": 74}}
    assert merged["qa"] == [{"question": "Why JWT?", "score": 80}]
    assert merged["topics"] == {"Auth": 72}
    assert merged["slides"] == [{"n": 1}]
    assert merged["subject"] == "Campus app"


def test_merge_handles_a_json_string_column():
    """Supabase sometimes hands JSONB back as text; the old code would have
    thrown that away silently."""
    merged = _merge_sentiment_state(json.dumps({"report": {"x": 1}}), [], [])
    assert merged["report"] == {"x": 1}


def test_merge_tolerates_empty_and_malformed_state():
    for existing in (None, {}, "", "not json", 42, []):
        merged = _merge_sentiment_state(existing, [{"a": 1}], [])
        assert merged["samples"] == [{"a": 1}]
        assert isinstance(merged, dict)


def test_merge_does_not_mutate_the_caller_state():
    original = {"report": {"x": 1}}
    _merge_sentiment_state(original, [{"a": 1}], [])
    assert original == {"report": {"x": 1}}, "the row we read must not be mutated in place"


# --------------------------------------------------------------------------- #
# 1. Authentication + ownership — asserted structurally.
#
# Driving a real WebSocket through Starlette's TestClient here would need the
# whole Supabase/Gemini stack stubbed; what actually matters is that the
# handler cannot be reached without a verified user and an ownership-scoped
# query. Both are checked against the source so a future edit that drops
# either one fails loudly.
# --------------------------------------------------------------------------- #
def _ws_sentiment_source() -> str:
    src = (BACKEND / "api" / "advanced.py").read_text(encoding="utf-8")
    tree = ast.parse(src)
    lines = src.split("\n")
    for node in ast.walk(tree):
        if isinstance(node, ast.AsyncFunctionDef) and node.name == "ws_sentiment":
            return "\n".join(lines[node.lineno - 1 : node.end_lineno])
    raise AssertionError("ws_sentiment handler not found")


def test_the_socket_requires_a_verified_user():
    body = _ws_sentiment_source()
    assert "user_from_token" in body, "the route must authenticate like every other WS route"
    assert "4401" in body, "an unauthenticated caller must be closed with 4401"


def test_every_query_in_the_handler_is_ownership_scoped():
    """A valid token for user A must not reach user B's session — on the read
    OR either of the writes."""
    body = _ws_sentiment_source()
    reads_and_writes = body.count('table("presentation_sessions")')
    scoped = body.count('.eq("profile_id", user["id"])')
    assert reads_and_writes > 0
    assert scoped >= reads_and_writes, (
        f"{reads_and_writes} queries on presentation_sessions but only {scoped} "
        "constrained by profile_id — an unscoped one is a cross-tenant read or write"
    )


def test_the_handler_never_writes_topic_scores_wholesale():
    """Guards against reintroducing the blob-clobbering write."""
    body = _ws_sentiment_source()
    assert '{"samples"' not in body, (
        "writing a fresh {samples, nudges} dict replaces topic_scores and destroys "
        "the report; merge into the existing state instead"
    )


@pytest.mark.parametrize("route", ["ws_sentiment"])
def test_no_websocket_route_in_advanced_is_unauthenticated(route):
    """Blanket guard: any future WS route added to this module must authenticate."""
    src = (BACKEND / "api" / "advanced.py").read_text(encoding="utf-8")
    tree = ast.parse(src)
    lines = src.split("\n")
    for node in ast.walk(tree):
        if not isinstance(node, ast.AsyncFunctionDef):
            continue
        if not any("websocket" in ast.dump(d) for d in node.decorator_list):
            continue
        body = "\n".join(lines[node.lineno - 1 : node.end_lineno])
        assert "user_from_token" in body, f"{node.name}() is an unauthenticated WebSocket route"
