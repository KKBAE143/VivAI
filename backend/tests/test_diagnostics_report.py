"""The report is the deliverable — the single file that gets handed over.

If grouping is wrong or a secret survives into it, the whole system has failed
at the last step.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from core.diagnostics import report as R
from core.diagnostics import scan as S


def _write(root, events):
    directory = root / "backend"
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / "events-2026-07-27.jsonl"
    path.write_text(
        "\n".join(json.dumps(e) for e in events) + "\n",
        encoding="utf-8",
    )
    return path


def _event(**kwargs):
    base = {
        "v": 1,
        "ts": datetime.now(timezone.utc).isoformat(),
        "source": "backend",
        "kind": "exception",
        "level": "ERROR",
        "message": "report build failed",
        "fingerprint": "aaa111",
    }
    base.update(kwargs)
    return base


def test_repeated_occurrences_collapse_into_one_section_with_a_count(tmp_path):
    _write(tmp_path, [_event() for _ in range(87)])
    text = R.build(tmp_path)
    assert text.count("### 1.") == 1, "87 occurrences must not print 87 sections"
    assert "87" in text


def test_distinct_problems_are_listed_separately(tmp_path):
    _write(
        tmp_path,
        [
            _event(fingerprint="a", message="report build failed"),
            _event(fingerprint="b", message="websocket died", level="WARNING"),
        ],
    )
    text = R.build(tmp_path)
    assert "report build failed" in text
    assert "websocket died" in text
    assert "**2 distinct problems**" in text or "2 distinct problems" in text


def test_errors_are_ranked_above_warnings(tmp_path):
    _write(
        tmp_path,
        [
            *[_event(fingerprint="warn", level="WARNING", message="noisy warning") for _ in range(50)],
            _event(fingerprint="err", level="ERROR", message="the actual crash"),
        ],
    )
    text = R.build(tmp_path)
    # The single error must outrank 50 warnings — severity first, then volume.
    assert text.index("the actual crash") < text.index("noisy warning")


def test_stack_traces_and_context_are_included(tmp_path):
    _write(
        tmp_path,
        [
            _event(
                error={
                    "type": "ValueError",
                    "message": "bad rubric",
                    "stack": 'Traceback...\n  File "live.py", line 447, in finalize\nValueError: bad rubric',
                },
                context={"route": "/api/viva", "mode": "viva"},
                request_id="abc123def456",
                session_id="s-42",
            )
        ],
    )
    text = R.build(tmp_path)
    assert "ValueError" in text
    assert "line 447" in text
    assert "/api/viva" in text
    assert "abc123def456" in text
    assert "s-42" in text


def test_an_empty_sink_produces_an_honest_report_not_a_crash(tmp_path):
    text = R.build(tmp_path)
    assert "No events captured" in text


def test_a_torn_final_line_does_not_kill_the_report(tmp_path):
    """A JSONL file is appended live; the process can die mid-write."""
    directory = tmp_path / "backend"
    directory.mkdir(parents=True)
    (directory / "events-2026-07-27.jsonl").write_text(
        json.dumps(_event(message="a real error")) + "\n" + '{"ts": "2026-0',
        encoding="utf-8",
    )
    text = R.build(tmp_path)
    assert "a real error" in text


def test_the_hours_window_filters_old_events(tmp_path):
    old = (datetime.now(timezone.utc) - timedelta(hours=48)).isoformat()
    _write(
        tmp_path,
        [
            _event(ts=old, fingerprint="old", message="from two days ago"),
            _event(fingerprint="new", message="from just now"),
        ],
    )
    text = R.build(tmp_path, hours=1)
    assert "from just now" in text
    assert "from two days ago" not in text


# --------------------------------------------------------------------------- #
# The leak scanner — the independent gate over what actually landed on disk
# --------------------------------------------------------------------------- #
def test_the_scanner_finds_a_jwt_that_slipped_through(tmp_path):
    directory = tmp_path / "backend"
    directory.mkdir(parents=True)
    (directory / "events-x.jsonl").write_text(
        '{"message": "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sig"}\n',
        encoding="utf-8",
    )
    findings = S.scan(tmp_path)
    assert findings and findings[0]["kind"] == "JWT"
    assert "SUSPICIOUS" in S.format_findings(findings)


def test_the_scanner_finds_a_live_env_value_regardless_of_shape(tmp_path):
    """The strongest rule: it does not need to recognise the format, only to
    know the value the running process holds."""
    directory = tmp_path / "backend"
    directory.mkdir(parents=True)
    (directory / "events-x.jsonl").write_text(
        '{"message": "call failed with wholly-unrecognisable-secret"}\n', encoding="utf-8"
    )
    findings = S.scan(tmp_path, environ={"MY_API_KEY": "wholly-unrecognisable-secret"})
    assert findings, "a known secret value must be caught even with no matching pattern"


def test_a_clean_sink_scans_clean(tmp_path):
    directory = tmp_path / "backend"
    directory.mkdir(parents=True)
    (directory / "events-x.jsonl").write_text(
        json.dumps(_event(message="report build failed", context={"mode": "viva"})) + "\n",
        encoding="utf-8",
    )
    assert S.scan(tmp_path, environ={}) == []


def test_a_real_capture_round_trip_leaks_nothing(tmp_path):
    """End to end: write through the real sink, render, then scan."""
    from core.diagnostics.sink import JsonlSink

    jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.SflKxwRJSMeKKF2QT4fwpMeJf36P"
    sink = JsonlSink(tmp_path / "backend", env_literals=(("hunter2secret", "[redacted:env]"),))
    sink.write(
        {
            "kind": "ws_error",
            "level": "ERROR",
            "message": f"ws://localhost:8000/ws/live/viva/s1?token={jwt} failed",
            "fingerprint": "ws1",
            "context": {"mode": "viva", "password": "hunter2secret"},
        }
    )
    sink.close()

    text = R.build(tmp_path)
    (tmp_path / "REPORT.md").write_text(text, encoding="utf-8")
    assert S.scan(tmp_path, environ={"SOME_TOKEN": "hunter2secret"}) == []
    assert "viva" in text, "the useful context must survive alongside the redaction"
