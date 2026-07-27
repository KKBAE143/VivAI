"""Fingerprinting decides what the report groups together.

Too loose and unrelated bugs merge into one useless bucket; too tight and the
same bug prints 400 times and buries everything else.

KEEP IN SYNC with `src/diagnostics/__tests__/fingerprint.test.ts`.
"""
from __future__ import annotations

from core.diagnostics import fingerprint as F

PY_STACK = '''Traceback (most recent call last):
  File "C:\\dev-projects\\horux-main\\backend\\.venv\\Lib\\site-packages\\anyio\\_backends\\_asyncio.py", line 807, in run
    result = func(*args)
  File "C:\\dev-projects\\horux-main\\backend\\api\\live.py", line 447, in finalize
    report = report_service.build_report(...)
ValueError: bad rubric
'''


def test_the_same_bug_with_different_ids_groups_together():
    a = F.fingerprint("ValueError", "session 3f9a2b1c-1111-2222-3333-444455556666 failed after 12s")
    b = F.fingerprint("ValueError", "session 8c7d6e5f-9999-8888-7777-666655554444 failed after 907s")
    assert a == b


def test_different_messages_do_not_group():
    a = F.fingerprint("ValueError", "bad rubric")
    b = F.fingerprint("ValueError", "missing transcript")
    assert a != b


def test_different_types_do_not_group():
    assert F.fingerprint("ValueError", "boom") != F.fingerprint("KeyError", "boom")


def test_the_same_message_from_different_call_sites_does_not_group():
    """Two features both logging 'report build failed' are two different bugs."""
    stack_a = PY_STACK
    stack_b = PY_STACK.replace("api\\live.py", "ai\\team_room.py")
    assert "team_room.py" in stack_b, "the fixture substitution itself must work"
    assert F.fingerprint("ValueError", "x", stack_a) != F.fingerprint("ValueError", "x", stack_b)


def test_vendor_frames_are_skipped_in_favour_of_app_frames():
    """Grouping on asyncio/_asyncio.py would merge every unrelated async bug."""
    assert F.top_app_frame(PY_STACK) == "live.py:447:finalize"


def test_redacted_placeholders_do_not_split_a_group():
    a = F.fingerprint("ApiError", "auth failed for [redacted:jwt]")
    b = F.fingerprint("ApiError", "auth failed for [redacted:opaque:88]")
    assert a == b


def test_fingerprint_is_short_and_stable():
    first = F.fingerprint("ValueError", "boom", PY_STACK)
    assert len(first) == F.FINGERPRINT_LEN
    assert first == F.fingerprint("ValueError", "boom", PY_STACK)


def test_js_frames_are_understood():
    stack = (
        "Error: boom\n"
        "    at flush (http://localhost:8080/node_modules/.vite/deps/chunk.js:12:3)\n"
        "    at useLiveSession (http://localhost:8080/src/lib/useLiveSession.ts:812:19)"
    )
    # Same `file:line:function` shape as the Python branch, so both languages
    # produce comparable frames in the report.
    assert F.top_app_frame(stack) == "useLiveSession.ts:812:useLiveSession"


def test_missing_input_never_raises():
    assert F.fingerprint(None, None, None)
    assert F.normalize_message("") == ""
    assert F.top_app_frame(None) == ""
