"""CLI: ``python -m core.diagnostics <report|scan|clear>``.

Invoked by ``diagnose.ps1``; usable directly when debugging the tooling itself.
"""
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

from core.diagnostics import report as _report
from core.diagnostics import scan as _scan
from core.diagnostics.sink import default_directory


def _root(args) -> Path:
    if args.dir:
        return Path(args.dir)
    try:
        from core.config import get_settings

        return default_directory(get_settings().diagnostics_dir)
    except Exception:  # noqa: BLE001 — usable even with no env configured
        return default_directory("diagnostics")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m core.diagnostics")
    parser.add_argument("command", choices=["report", "scan", "clear"])
    parser.add_argument("--dir", default=None, help="diagnostics directory")
    parser.add_argument("--hours", type=float, default=None, help="only the last N hours")
    parser.add_argument("--top", type=int, default=12, help="how many problems to detail")
    parser.add_argument("--out", default=None, help="report output path")
    args = parser.parse_args(argv)

    root = _root(args)

    if args.command == "clear":
        if root.exists():
            for child in root.iterdir():
                if child.name in ("README.md", ".gitkeep"):
                    continue
                shutil.rmtree(child, ignore_errors=True) if child.is_dir() else child.unlink(
                    missing_ok=True
                )
        print(f"Cleared {root}")
        return 0

    if args.command == "scan":
        findings = _scan.scan(root)
        print(_scan.format_findings(findings))
        return 1 if findings else 0

    events = _report.load_events(root, args.hours)
    text = _report.render(events, top=args.top, hours=args.hours)
    out = Path(args.out) if args.out else root / "REPORT.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text, encoding="utf-8")
    print(f"Wrote {out}  ({len(events)} events)")

    findings = _scan.scan(root)
    print(_scan.format_findings(findings))
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
