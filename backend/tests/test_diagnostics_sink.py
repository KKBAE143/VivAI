"""The sink writes to the user's working tree from inside request handlers.

Two properties matter more than anything it records: it must never break the
app, and it must never grow without bound.
"""
from __future__ import annotations

import json
from pathlib import Path

from core.diagnostics.sink import JsonlSink


def _read(directory: Path) -> list[dict]:
    lines: list[dict] = []
    for path in sorted(directory.glob("events-*.jsonl")):
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                lines.append(json.loads(line))
    return lines


def test_events_are_appended_as_one_json_object_per_line(tmp_path):
    sink = JsonlSink(tmp_path)
    assert sink.write({"kind": "exception", "message": "boom", "fingerprint": "a"})
    assert sink.write({"kind": "log", "message": "second", "fingerprint": "b"})
    sink.close()

    events = _read(tmp_path)
    assert [e["message"] for e in events] == ["boom", "second"]
    assert [e["seq"] for e in events] == [1, 2]
    assert all(e["v"] == 1 and e["ts"] for e in events)


def test_secrets_are_redacted_on_the_way_to_disk(tmp_path):
    """The sink is the last line of defense — a caller that forgets to redact
    must not be able to put a credential on disk."""
    jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefghijklmnopqrstuvwxyz012345"
    sink = JsonlSink(tmp_path)
    sink.write({"kind": "ws_error", "message": f"failed with token={jwt}", "access_token": jwt})
    sink.close()

    raw = "\n".join(p.read_text(encoding="utf-8") for p in tmp_path.glob("*.jsonl"))
    assert jwt not in raw
    assert "eyJhbGci" not in raw


def test_a_flood_is_collapsed_instead_of_filling_the_disk(tmp_path):
    """A React render loop or reconnect storm would otherwise write gigabytes
    in seconds and bury the one event that mattered."""
    sink = JsonlSink(tmp_path, burst=5)
    written = sum(sink.write({"message": "same", "fingerprint": "loop"}) for _ in range(500))
    sink.close()
    assert written == 5, f"expected the bucket to cap at 5, wrote {written}"


def test_distinct_errors_are_not_suppressed_by_another_error_flooding(tmp_path):
    sink = JsonlSink(tmp_path, burst=2)
    for _ in range(50):
        sink.write({"message": "noisy", "fingerprint": "noisy"})
    assert sink.write({"message": "the important one", "fingerprint": "rare"})
    sink.close()
    assert any(e["message"] == "the important one" for e in _read(tmp_path))


def test_rotation_caps_a_single_file(tmp_path):
    """Note the payload: a repeated character collapses to
    `[redacted:opaque:N]` and this test then passes without ever rotating.
    Use prose that survives redaction, and assert rotated files actually
    appeared rather than only that nothing grew."""
    sink = JsonlSink(tmp_path, max_files=3, burst=100_000)
    sink.max_bytes = 40_000  # keep the test fast; rotation is size-driven
    message = "the examiner could not build a report for this session " * 12
    for index in range(400):
        assert sink.write({"message": message, "fingerprint": f"f{index}"})
    sink.close()

    rotated = sorted(p.name for p in tmp_path.glob("events-*.jsonl.*"))
    assert rotated, f"rotation never happened; files={[p.name for p in tmp_path.iterdir()]}"
    for path in tmp_path.iterdir():
        assert path.stat().st_size < 200_000, f"{path.name} grew unbounded"


def test_rotation_keeps_at_most_max_files(tmp_path):
    sink = JsonlSink(tmp_path, max_files=3, burst=100_000)
    sink.max_bytes = 20_000
    message = "a genuine failure message that survives redaction intact " * 10
    for index in range(600):
        sink.write({"message": message, "fingerprint": f"g{index}"})
    sink.close()
    assert len(list(tmp_path.glob("events-*.jsonl.*"))) <= 3


def test_an_unwritable_directory_is_survivable(tmp_path):
    """The app must boot and serve even when the sink cannot open a file."""
    blocker = tmp_path / "blocked"
    blocker.write_text("i am a file, not a directory", encoding="utf-8")
    sink = JsonlSink(blocker / "nested")
    assert sink.write({"message": "boom"}) is False  # reported, not raised
    assert sink.write({"message": "again"}) is False


def test_write_never_raises_on_unserialisable_input(tmp_path):
    sink = JsonlSink(tmp_path)
    assert sink.write({"message": object(), "context": {"fn": lambda: 1}}) in (True, False)
    recursive: dict = {}
    recursive["self"] = recursive
    assert sink.write(recursive) in (True, False)
    sink.close()


def test_an_oversized_event_is_trimmed_not_dropped(tmp_path):
    sink = JsonlSink(tmp_path)
    assert sink.write(
        {
            "kind": "exception",
            "message": "real failure",
            "fingerprint": "big",
            "breadcrumbs": [{"msg": "y" * 200} for _ in range(500)],
        }
    )
    sink.close()
    events = _read(tmp_path)
    assert len(events) == 1
    assert events[0]["message"] == "real failure"


def test_old_files_are_pruned(tmp_path):
    import os
    import time

    stale = tmp_path / "events-2000-01-01.jsonl"
    stale.parent.mkdir(parents=True, exist_ok=True)
    stale.write_text('{"old": true}\n', encoding="utf-8")
    old = time.time() - 40 * 86400
    os.utime(stale, (old, old))

    sink = JsonlSink(tmp_path, retention_days=7)
    sink.write({"message": "fresh"})
    sink.close()
    assert not stale.exists(), "a 40-day-old file should have been pruned"
