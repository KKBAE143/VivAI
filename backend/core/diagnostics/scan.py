"""Independent leak scanner over whatever actually landed on disk.

Redaction is applied at write time, but a rule can only catch shapes it knows
about. This is the second, independent check: it greps the finished files for
credential shapes AND for the literal values of every secret-looking
environment variable in the running process.

`diagnose.ps1` runs it after every report and fails loudly on a hit, so a
redaction miss cannot survive past the first time anyone generates a report.
"""
from __future__ import annotations

import os
import re
from pathlib import Path

# Shapes that must never appear in a captured file.
_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("JWT", re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")),
    ("Google API key", re.compile(r"\bAIza[0-9A-Za-z_-]{20,}")),
    ("Supabase key", re.compile(r"\bsb[a-z]*_[A-Za-z0-9_-]{20,}")),
    ("prefixed API key", re.compile(r"\b(sk|pk|rk)-[A-Za-z0-9_-]{20,}")),
    ("Authorization header", re.compile(r"(?i)\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{12,}")),
    ("email address", re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")),
]

_SECRET_ENV_RE = re.compile(
    r"(KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL|SIGNATURE|SALT)", re.IGNORECASE
)
_MIN_ENV_LITERAL = 8


def env_literals(environ: dict[str, str] | None = None) -> dict[str, str]:
    """Secret-looking env values worth searching for verbatim."""
    env = os.environ if environ is None else environ
    out: dict[str, str] = {}
    for name, value in env.items():
        if not value or len(value) < _MIN_ENV_LITERAL:
            continue
        if not _SECRET_ENV_RE.search(name):
            continue
        if value.startswith(("http://", "https://")) and "@" not in value:
            continue
        out[name] = value
    return out


def scan(root: Path, environ: dict[str, str] | None = None) -> list[dict]:
    """Return one finding per suspicious line. Empty means clean."""
    findings: list[dict] = []
    if not root.exists():
        return findings
    literals = env_literals(environ)

    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in (".jsonl", ".md", ".json", ".txt"):
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except Exception:  # noqa: BLE001
            continue
        for lineno, line in enumerate(text.splitlines(), start=1):
            for name, value in literals.items():
                if value in line:
                    findings.append(
                        {
                            "file": str(path),
                            "line": lineno,
                            "kind": f"live value of ${name}",
                            "excerpt": line[:160],
                        }
                    )
            for label, pattern in _PATTERNS:
                match = pattern.search(line)
                if match:
                    findings.append(
                        {
                            "file": str(path),
                            "line": lineno,
                            "kind": label,
                            "excerpt": line[max(0, match.start() - 40) : match.end() + 40],
                        }
                    )
    return findings


def format_findings(findings: list[dict]) -> str:
    if not findings:
        return "Leak scan: clean — no credential shapes or live env values found."
    lines = [f"Leak scan: {len(findings)} SUSPICIOUS MATCH(ES) — do not share these files:"]
    for finding in findings[:40]:
        lines.append(f"  {finding['file']}:{finding['line']}  [{finding['kind']}]")
        lines.append(f"    {finding['excerpt']}")
    if len(findings) > 40:
        lines.append(f"  … and {len(findings) - 40} more")
    return "\n".join(lines)
