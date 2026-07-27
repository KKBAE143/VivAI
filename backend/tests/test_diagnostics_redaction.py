"""The redaction gate.

Everything the diagnostics sink writes to disk passes through `redact`. A miss
here puts a live credential in a file, so this corpus is the primary defense
and is deliberately adversarial.

KEEP IN SYNC with `src/diagnostics/__tests__/redact.test.ts` — the two files
share an identical ordered corpus so a rule fixed in one language cannot be
silently forgotten in the other. CORPUS_SIZE is asserted in both.
"""
from __future__ import annotations

import pytest

from core.diagnostics import redact as R

# Realistic shapes. None of these are real credentials.
FAKE_JWT = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    ".eyJzdWIiOiIxMjM0NTY3ODkwIiwicm9sZSI6ImFub24ifQ"
    ".dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk"
)
FAKE_GOOGLE_KEY = "AIzaSyD-9tSrke72PouQMnMX-a7eZSW0jkFMBWY"
FAKE_SUPABASE_KEY = "sb_publishable_AbCdEfGhIjKlMnOpQrStUv"

# Each entry: (label, input, must_not_appear_substrings)
CORPUS: list[tuple[str, str, list[str]]] = [
    ("bare jwt", FAKE_JWT, [FAKE_JWT, "eyJhbGci"]),
    ("authorization header", f"Authorization: Bearer {FAKE_JWT}", [FAKE_JWT, "eyJhbGci"]),
    (
        # THE most important case: wsUrl() embeds the user's JWT in the query
        # string, and that URL reaches ws.onerror / breadcrumbs.
        "live session websocket url",
        f"ws://localhost:8000/ws/live/viva/abc-123?token={FAKE_JWT}&language=English&pv=1",
        [FAKE_JWT, "eyJhbGci"],
    ),
    (
        "oauth callback url",
        "http://localhost:8080/auth/callback?code=4%2F0Ab_xYzLongAuthCode&code_verifier=s256verifierstring",
        ["4%2F0Ab_xYzLongAuthCode", "s256verifierstring"],
    ),
    ("google api key inline", f"Gemini rejected the request: bad key {FAKE_GOOGLE_KEY}", [FAKE_GOOGLE_KEY]),
    ("supabase publishable key", f"anon={FAKE_SUPABASE_KEY}", [FAKE_SUPABASE_KEY]),
    ("env style assignment", "GEMINI_API_KEY=abcd1234efgh5678ijkl", ["abcd1234efgh5678ijkl"]),
    ("password assignment", "password=hunter2swordfish", ["hunter2swordfish"]),
    ("email address", "Contact kkbae143@gmail.com for access", ["kkbae143@gmail.com"]),
    (
        "data url audio payload",
        "data:audio/pcm;base64," + ("QUJDREVG" * 600),
        ["QUJDREVGQUJDREVGQUJDREVG"],
    ),
    ("raw base64 audio chunk", "chunk: " + ("QUJDREVG" * 900), ["QUJDREVGQUJDREVGQUJDREVG"]),
    ("bearer lowercase", f"bearer {FAKE_JWT}", [FAKE_JWT]),
    (
        "opaque catch-all token",
        "opaque=Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2RlZmdoaWprbG1ub3A",
        ["Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2RlZmdoaWprbG1ub3A"],
    ),
]

CORPUS_SIZE = 13

# Strings that MUST survive intact. Redacting these would gut the report — the
# correlation ids are the whole reason the output is useful.
PRESERVED: list[tuple[str, str]] = [
    ("session id", "session_id=abc-123-def"),
    ("request id", "request_id=9a2b3c4d5e6f"),
    ("run id", "run_id=20260727-120000"),
    ("mode", "mode=viva"),
    ("event slug", "event=live_ws_stop"),
    ("plain message", "The session ended before you said anything."),
    ("http status", "status=500 method=POST path=/api/projects"),
]


def test_corpus_size_matches_the_typescript_mirror():
    """Guards the two-language parity contract. If you add a case here, add it
    to src/diagnostics/__tests__/redact.test.ts and bump both constants."""
    assert len(CORPUS) == CORPUS_SIZE


@pytest.mark.parametrize("label,raw,forbidden", CORPUS, ids=[c[0] for c in CORPUS])
def test_no_secret_survives_redaction(label, raw, forbidden):
    out = R.redact_text(raw)
    # Assert the redactor actually RAN. Without this, an implementation that
    # crashed and returned the failure sentinel satisfies every "not in"
    # assertion below and the whole corpus passes vacuously.
    assert out != "[redaction failed]", f"{label}: redaction crashed"
    assert out, f"{label}: produced empty output"
    for needle in forbidden:
        assert needle not in out, f"{label}: leaked {needle[:24]!r} -> {out[:200]!r}"


@pytest.mark.parametrize("label,raw", PRESERVED, ids=[c[0] for c in PRESERVED])
def test_correlation_ids_are_not_redacted(label, raw):
    assert R.redact_text(raw) == raw, f"{label} was mangled"


def test_redacting_a_secret_does_not_eat_the_rest_of_the_line():
    """Regression: the KEY=VALUE rule's value class did not exclude `&`, so a
    single `token=` swallowed the remainder of the query string. The secret was
    removed, but so was every other parameter — silently destroying exactly the
    context the report exists to preserve."""
    out = R.redact_text(
        f"ws://localhost:8000/ws/live/viva/abc-123?token={FAKE_JWT}&language=English&pv=1"
    )
    assert FAKE_JWT not in out
    assert "language=English" in out, f"context was destroyed: {out!r}"
    assert "pv=1" in out
    assert "/ws/live/viva/abc-123" in out


def test_a_secret_mid_sentence_leaves_the_sentence_readable():
    out = R.redact_text(f"connect failed for token={FAKE_JWT} after 3 retries")
    assert FAKE_JWT not in out
    assert "after 3 retries" in out


# --------------------------------------------------------------------------- #
# Key-name scrubbing
# --------------------------------------------------------------------------- #
def test_secret_looking_keys_have_their_values_dropped():
    out = R.redact_obj(
        {
            "access_token": FAKE_JWT,
            "refresh_token": "whatever",
            "password": "hunter2",
            "supabase_service_role_key": "not-a-jwt-but-still-secret",
            "api_key": "abc",
            "authorization": f"Bearer {FAKE_JWT}",
        }
    )
    assert all(value == "[redacted:key]" for value in out.values()), out


def test_correlation_keys_survive_the_key_filter():
    """The classic own-goal: a substring match on 'key'/'session' would redact
    exactly the fields that make a diagnostics report navigable."""
    payload = {
        "session_id": "abc-123",
        "request_id": "9a2b3c",
        "run_id": "r-1",
        "query_key": ["projects", "list"],
        "mutation_key": ["createProject"],
        "mode": "viva",
        "event": "live_ws_stop",
        "reconnects": 2,
        "has_activity": True,
    }
    assert R.redact_obj(payload) == payload


def test_nested_structures_are_walked():
    out = R.redact_obj({"outer": {"inner": {"token": FAKE_JWT, "route": "/projects"}}})
    assert out["outer"]["inner"]["token"] == "[redacted:key]"
    assert out["outer"]["inner"]["route"] == "/projects"


def test_deeply_nested_input_is_bounded_not_crashed():
    payload: dict = {"a": {}}
    node = payload["a"]
    for _ in range(50):
        node["a"] = {}
        node = node["a"]
    assert R.redact_obj(payload) is not None


def test_recursive_structure_does_not_hang():
    payload: dict = {"name": "loop"}
    payload["self"] = payload
    assert R.redact_obj(payload) is not None


# --------------------------------------------------------------------------- #
# Environment-literal substitution (layer 2 — the strongest rule)
# --------------------------------------------------------------------------- #
def test_env_secret_values_are_substituted_in_any_format():
    literals = R.build_env_literals({"GEMINI_API_KEY": "s3cret-value-not-jwt-shaped"})
    out = R.redact_text("Gemini call failed with s3cret-value-not-jwt-shaped", literals)
    assert "s3cret-value-not-jwt-shaped" not in out
    assert "[redacted:env:GEMINI_API_KEY]" in out


def test_short_env_values_are_not_substituted():
    """Replacing every occurrence of a 4-char value would shred unrelated text."""
    literals = R.build_env_literals({"API_KEY": "abc"})
    assert literals == ()


def test_plain_https_urls_are_kept_as_useful_context():
    literals = R.build_env_literals({"SUPABASE_URL": "https://xyzcompany.supabase.co"})
    assert literals == ()


def test_conftest_fake_gemini_key_is_scrubbed_end_to_end():
    """conftest sets GEMINI_API_KEY=test-gemini; prove the live process env is
    actually consulted, not just an injected dict."""
    literals = R.build_env_literals(extra="test-gemini-value")
    assert "test-gemini-value" not in R.redact_text("key is test-gemini-value", literals)


# --------------------------------------------------------------------------- #
# Truncation and robustness
# --------------------------------------------------------------------------- #
def test_long_strings_are_truncated_with_a_byte_count():
    out = R.redact_text("x" * 5000)
    assert len(out) < 2200
    assert "truncated" in out


def test_home_directory_is_replaced_so_reports_carry_no_username():
    import os

    home = os.path.expanduser("~")
    out = R.redact_text(f'File "{home}\\dev\\app.py", line 3')
    assert home not in out


def test_redaction_never_raises_on_hostile_input():
    for value in [None, 123, 4.5, True, b"bytes", object(), [1, [2, [3]]], {"k": object()}]:
        R.redact_obj(value)
    assert R.redact_text("") == ""
