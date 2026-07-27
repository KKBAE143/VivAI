"""Secret redaction for the diagnostics sink.

This module is the single most safety-critical piece of the diagnostics system.
Everything written to disk passes through it. A miss here means a live JWT or
API key sitting in a file on disk, so the design deliberately errs toward
over-redaction and layers several independent defenses:

1. Environment-literal substitution — the strongest rule. Any value we hold in
   an env var whose NAME looks secret is replaced wherever it appears, in any
   format. This catches real secrets regardless of shape.
2. Key-name scrubbing for structured data (``{"token": ...}``).
3. Value-pattern scrubbing for known secret shapes (JWT, Google keys, URL
   query values, ...).
4. A catch-all for any long opaque token, so an undetected secret must be BOTH
   under 40 characters AND match no named pattern to survive.
5. Truncation, so a huge base64 audio blob cannot fill the disk.

Pure and stdlib-only so it can be unit-tested without any app wiring.

KEEP IN SYNC with ``src/diagnostics/redact.ts`` — the shared test corpus lives
in ``backend/tests/test_diagnostics_redaction.py`` and
``src/diagnostics/__tests__/redact.test.ts``.
"""
from __future__ import annotations

import os
import re

# Maximum length for any single captured string before truncation.
MAX_STRING_CHARS = 2000
# Base64-ish runs longer than this are payloads (audio/image), not messages.
MAX_BASE64_RUN = 256
# Any opaque token at least this long is assumed to be a credential.
OPAQUE_TOKEN_MIN = 40
# Depth limit when walking nested structures.
MAX_DEPTH = 6

REDACTED = "[redacted]"

# --------------------------------------------------------------------------- #
# Key names whose VALUE must never be recorded.
#
# Anchored on word boundaries (`(^|_)word($|_)`) rather than a bare substring
# match, specifically so that `session_id`, `request_id`, `run_id`, `query_key`
# and `mutation_key` do NOT match. Those are the correlation ids that make the
# whole report useful — redacting them is the classic own-goal for this kind of
# filter, so there are explicit negative tests for each.
# --------------------------------------------------------------------------- #
_SECRET_KEY_RE = re.compile(
    r"(^|_)("
    r"token|secret|password|passwd|pwd|credential|credentials|cookie|jwt|bearer"
    r"|api[-_]?key|apikey|access[-_]?key|private[-_]?key|refresh|authorization|auth"
    r"|session[-_]?key|signature|sig|salt|nonce"
    r")($|_)",
    re.IGNORECASE,
)

# Anything named `*_key` or `key` is treated as a credential too — otherwise
# `supabase_service_role_key` slips through, since the anchored list above only
# knows about `api_key`-shaped names. These few names are the deliberate
# exceptions: they are correlation/caching identifiers that the report needs,
# and losing them would gut its usefulness.
_SAFE_KEY_NAMES = frozenset(
    {
        "query_key",
        "mutation_key",
        "cache_key",
        "route_key",
        "idempotency_key",
        "primary_key",
        "foreign_key",
        "sort_key",
    }
)

# Env var names whose values get literal-substituted out of every string.
_SECRET_ENV_RE = re.compile(
    r"(KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL|DSN|URI|URL|AUTH|SIGNATURE|SALT)",
    re.IGNORECASE,
)
# Env values shorter than this are too generic to substitute safely — replacing
# every occurrence of a 4-character value would shred unrelated text.
_MIN_ENV_LITERAL = 8

# URL/query parameter names whose values must be stripped. This is what saves
# the output of `wsUrl()`, which embeds the user's JWT as `?token=<jwt>`.
_SENSITIVE_QUERY_KEYS = (
    "token|access_token|refresh_token|id_token|key|apikey|api_key|code"
    "|code_verifier|password|secret|signature|sig|auth|authorization|session"
)

# Ordered value patterns. Order matters: specific shapes first, catch-all last.
_VALUE_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    # JWTs — covers Supabase anon AND service-role keys, plus user access tokens.
    (
        re.compile(r"\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*"),
        "[redacted:jwt]",
    ),
    # Authorization headers in any casing.
    (re.compile(r"(?i)\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]+"), r"\1 [redacted]"),
    # Google / Gemini API keys.
    (re.compile(r"\bAIza[0-9A-Za-z_-]{10,}"), "[redacted:google-key]"),
    # Supabase non-JWT keys (sb_publishable_..., sbp_..., etc).
    (re.compile(r"\bsb[a-z]*_[A-Za-z0-9_-]{16,}"), "[redacted:supabase-key]"),
    # OpenAI / Anthropic style prefixed keys.
    (re.compile(r"\b(sk|pk|rk)-[A-Za-z0-9_-]{16,}"), "[redacted:api-key]"),
    # Query-string values, e.g. ws://host/path?token=<jwt>&language=English.
    (
        re.compile(rf"(?i)([?&](?:{_SENSITIVE_QUERY_KEYS})=)[^&\s\"'#]+"),
        r"\1[redacted]",
    ),
    # KEY=VALUE / KEY: VALUE env-style pairs.
    #
    # The value class must exclude `&` and `#` as well as whitespace: without
    # them this rule is greedy across query strings, so a single `token=` would
    # swallow the rest of the line (`&language=English&pv=1` and everything
    # after it). That is not a security hole, but it silently destroys exactly
    # the context a diagnostics report exists to preserve.
    (
        re.compile(
            r"(?i)\b([A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL)[A-Z0-9_]*)"
            r"\s*[=:]\s*(\"?)([^\s\"',;&#]+)"
        ),
        r"\1=\2[redacted]",
    ),
    # Email addresses (PII, not a secret, but must not be persisted).
    (
        re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),
        "[redacted:email]",
    ),
]

# data: URLs carrying base64 media (screen frames, PCM audio).
_DATA_URL_RE = re.compile(r"(data:[\w.+-]+/[\w.+-]+;base64,)[A-Za-z0-9+/=]{20,}")
# Bare long base64 runs (raw audio chunks that leaked into a message).
_BASE64_RUN_RE = re.compile(rf"[A-Za-z0-9+/]{{{MAX_BASE64_RUN},}}={{0,2}}")
# Catch-all: any long opaque token. Uses explicit lookarounds rather than \b
# because `=` and `-` are non-word characters and would break \b semantics.
_OPAQUE_RE = re.compile(
    rf"(?<![A-Za-z0-9_+/=-])[A-Za-z0-9_+/=-]{{{OPAQUE_TOKEN_MIN},}}(?![A-Za-z0-9_+/=-])"
)


def build_env_literals(
    environ: dict[str, str] | None = None, extra: str = ""
) -> tuple[tuple[str, str], ...]:
    """Snapshot secret env values so they can be substituted out of any string.

    Returns ``((literal, replacement), ...)`` sorted longest-first, so that a
    value which contains another value is replaced first.

    `extra` is a comma-separated list of additional literals to scrub, from the
    ``diagnostics_extra_redactions`` setting — an escape hatch for a secret we
    do not otherwise recognise.
    """
    env = os.environ if environ is None else environ
    literals: list[tuple[str, str]] = []
    for name, value in env.items():
        if not value or len(value) < _MIN_ENV_LITERAL:
            continue
        if not _SECRET_ENV_RE.search(name):
            continue
        # A URL-shaped setting (SUPABASE_URL) is not itself a secret and is
        # useful context; only its credential-bearing parts matter, and those
        # are handled by the query-string rule.
        if value.startswith(("http://", "https://")) and "@" not in value:
            continue
        literals.append((value, f"[redacted:env:{name}]"))
    for item in (extra or "").split(","):
        literal = item.strip()
        if len(literal) >= _MIN_ENV_LITERAL:
            literals.append((literal, "[redacted:configured]"))
    literals.sort(key=lambda pair: len(pair[0]), reverse=True)
    return tuple(literals)


# Fields allowed a larger budget than MAX_STRING_CHARS. A traceback is the most
# useful thing in a record; clipping it to 2000 characters throws away the
# frames that actually matter.
_LARGE_FIELDS = {"stack": 8000}


def redact_text(
    text: str,
    env_literals: tuple[tuple[str, str], ...] = (),
    *,
    truncate: bool = True,
    max_chars: int = MAX_STRING_CHARS,
) -> str:
    """Scrub secrets from a single string. Never raises."""
    if not text:
        return text
    try:
        # Layer 2 — exact env values first; the most reliable signal we have.
        for literal, replacement in env_literals:
            if literal in text:
                text = text.replace(literal, replacement)

        # Media payloads: keep the shape, drop the bytes.
        text = _DATA_URL_RE.sub(
            lambda m: f"{m.group(1)}[truncated {len(m.group(0)) - len(m.group(1))} bytes]",
            text,
        )
        text = _BASE64_RUN_RE.sub(lambda m: f"[base64 truncated {len(m.group(0))} bytes]", text)

        # Layer 4 — named secret shapes.
        for pattern, replacement in _VALUE_PATTERNS:
            text = pattern.sub(replacement, text)

        # Layer 4 (catch-all) — anything long and opaque that survived.
        text = _OPAQUE_RE.sub(lambda m: f"[redacted:opaque:{len(m.group(0))}]", text)

        # Home directory -> ~ so reports are portable and carry no username.
        home = os.path.expanduser("~")
        if home and len(home) >= 4:
            text = text.replace(home, "~").replace(home.replace("\\", "\\\\"), "~")

        if truncate and len(text) > max_chars:
            dropped = len(text) - max_chars
            text = f"{text[:max_chars]}…[truncated {dropped} chars]"
        return text
    except Exception:  # noqa: BLE001 — redaction must never break capture
        # If anything at all goes wrong we drop the value rather than risk
        # writing an unredacted secret.
        return "[redaction failed]"


def redact_obj(
    value: object, env_literals: tuple[tuple[str, str], ...] = (), _depth: int = 0
) -> object:
    """Recursively scrub a JSON-ish structure. Never raises.

    Values under a secret-looking KEY are dropped entirely rather than
    pattern-scrubbed — if the key says it is a token, we do not care what shape
    the value has.
    """
    try:
        if _depth > MAX_DEPTH:
            return "[redacted:too-deep]"
        if value is None or isinstance(value, (bool, int, float)):
            return value
        if isinstance(value, str):
            return redact_text(value, env_literals)
        if isinstance(value, dict):
            out: dict[str, object] = {}
            for key, item in list(value.items())[:100]:
                name = str(key)
                if looks_secret_key(name):
                    out[name] = "[redacted:key]"
                elif name in _LARGE_FIELDS and isinstance(item, str):
                    out[name] = redact_text(item, env_literals, max_chars=_LARGE_FIELDS[name])
                else:
                    out[name] = redact_obj(item, env_literals, _depth + 1)
            return out
        if isinstance(value, (list, tuple, set)):
            return [redact_obj(item, env_literals, _depth + 1) for item in list(value)[:100]]
        return redact_text(str(value), env_literals)
    except Exception:  # noqa: BLE001
        return "[redaction failed]"


def looks_secret_key(name: str) -> bool:
    """Should the VALUE under this key be dropped outright?

    Exposed for tests and for the context allowlist.
    """
    lowered = name.strip().lower()
    if lowered in _SAFE_KEY_NAMES:
        return False
    if _SECRET_KEY_RE.search(lowered):
        return True
    return lowered == "key" or lowered.endswith("_key")
