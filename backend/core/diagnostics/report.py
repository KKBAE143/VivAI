"""Render the captured events into one Markdown file a human can hand over.

The raw JSONL is the fidelity record; this is the thing you actually read. It
groups by fingerprint so a bug that fired 87 times occupies one section with a
count rather than 87 near-identical blocks, and it puts the newest and most
severe first, because the reason anyone opens this file is "what just broke".
"""
from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

_LEVEL_RANK = {"CRITICAL": 0, "ERROR": 1, "WARNING": 2, "INFO": 3, "DEBUG": 4}
_SOURCE_LABEL = {
    "backend": "Backend",
    "frontend": "Browser",
    "ssr": "Server render",
    "vite": "Build",
}


def load_events(root: Path, hours: float | None = None) -> list[dict]:
    """Read every event file under `root`. Malformed lines are skipped, not fatal."""
    cutoff = None
    if hours:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    events: list[dict] = []
    if not root.exists():
        return events
    for path in sorted(root.rglob("*.jsonl*")):
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except Exception:  # noqa: BLE001
            continue
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except Exception:  # noqa: BLE001 — a torn last line must not kill the report
                continue
            if cutoff is not None:
                try:
                    if datetime.fromisoformat(event["ts"]) < cutoff:
                        continue
                except Exception:  # noqa: BLE001
                    pass
            event.setdefault("_file", path.name)
            events.append(event)
    return events


def group(events: list[dict]) -> list[dict]:
    """Collapse events into per-fingerprint groups, worst and newest first."""
    buckets: dict[str, list[dict]] = defaultdict(list)
    for event in events:
        key = event.get("fingerprint") or event.get("message") or "unknown"
        buckets[key].append(event)

    groups = []
    for key, items in buckets.items():
        items.sort(key=lambda e: str(e.get("ts", "")))
        newest = items[-1]
        suppressed = sum(int(e.get("suppressed_since_last") or 0) for e in items)
        groups.append(
            {
                "fingerprint": key,
                "count": len(items) + suppressed,
                "recorded": len(items),
                "suppressed": suppressed,
                "first_seen": items[0].get("ts"),
                "last_seen": newest.get("ts"),
                "level": min(
                    (e.get("level", "INFO") for e in items),
                    key=lambda lv: _LEVEL_RANK.get(str(lv).upper(), 9),
                ),
                "sources": sorted({str(e.get("source", "?")) for e in items}),
                "sample": newest,
                "routes": sorted({str(e.get("context", {}).get("route") or e.get("context", {}).get("url_path") or "") for e in items} - {""}),
                "sessions": sorted({str(e.get("session_id") or "") for e in items} - {""})[:5],
                "requests": sorted({str(e.get("request_id") or "") for e in items} - {""})[:5],
            }
        )
    groups.sort(
        key=lambda g: (
            _LEVEL_RANK.get(str(g["level"]).upper(), 9),
            -g["count"],
            str(g["last_seen"] or ""),
        )
    )
    return groups


def _fence(text: str, limit: int = 3000) -> str:
    body = (text or "").rstrip()
    if len(body) > limit:
        body = body[:limit] + f"\n… [{len(text) - limit} more characters]"
    return f"```\n{body}\n```"


def render(events: list[dict], *, top: int = 12, hours: float | None = None) -> str:
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    groups = group(events)
    errors = [g for g in groups if str(g["level"]).upper() in ("ERROR", "CRITICAL")]
    warnings = [g for g in groups if str(g["level"]).upper() == "WARNING"]

    out: list[str] = []
    out.append("# Diagnostics report")
    out.append("")
    out.append(f"Generated {now} · window: {'last %g h' % hours if hours else 'all captured data'}")
    out.append("")

    if not events:
        out.append("**No events captured.**")
        out.append("")
        out.append(
            "That means nothing failed in the captured window — or the app has not been "
            "run since diagnostics were enabled. Reproduce the problem, then run "
            "`diagnose.bat` again."
        )
        return "\n".join(out) + "\n"

    runs = sorted({str(e.get("run_id") or "") for e in events} - {""})
    out.append(
        f"**{len(events)} events** across **{len(groups)} distinct problems** "
        f"({len(errors)} errors, {len(warnings)} warnings) from {len(runs)} app run(s)."
    )
    out.append("")

    # -- summary table -- #
    out.append("## Summary")
    out.append("")
    out.append("| # | Level | Count | Where | Problem | Last seen |")
    out.append("|---|-------|-------|-------|---------|-----------|")
    for index, g in enumerate(groups[:top], start=1):
        sample = g["sample"]
        error = sample.get("error") or {}
        title = error.get("type") or sample.get("kind") or "event"
        message = str(sample.get("message") or error.get("message") or "").replace("|", "\\|")
        where = "/".join(_SOURCE_LABEL.get(s, s) for s in g["sources"])
        out.append(
            f"| {index} | {g['level']} | {g['count']} | {where} | "
            f"**{title}** — {message[:70]} | {str(g['last_seen'])[:19]} |"
        )
    if len(groups) > top:
        out.append(f"| … | | | | _{len(groups) - top} more, see the raw .jsonl_ | |")
    out.append("")

    # -- detail -- #
    out.append("## Details")
    out.append("")
    for index, g in enumerate(groups[:top], start=1):
        sample = g["sample"]
        error = sample.get("error") or {}
        title = error.get("type") or sample.get("kind") or "event"
        out.append(f"### {index}. {title} — {str(sample.get('message') or '')[:110]}")
        out.append("")
        out.append(
            f"- **Level:** {g['level']} · **Occurrences:** {g['count']}"
            + (f" ({g['suppressed']} suppressed by rate limit)" if g["suppressed"] else "")
        )
        out.append(f"- **Source:** {'/'.join(g['sources'])} · **Logger:** {sample.get('logger') or '—'}")
        out.append(f"- **First seen:** {g['first_seen']} · **Last seen:** {g['last_seen']}")
        if sample.get("event"):
            out.append(f"- **Event:** `{sample['event']}`")
        if g["routes"]:
            out.append(f"- **Routes:** {', '.join('`%s`' % r for r in g['routes'][:6])}")
        if g["sessions"]:
            out.append(f"- **Sessions:** {', '.join('`%s`' % s for s in g['sessions'])}")
        if g["requests"]:
            out.append(
                f"- **Request ids:** {', '.join('`%s`' % r for r in g['requests'])} "
                "(use these to line up browser and backend events)"
            )
        if sample.get("context"):
            out.append(f"- **Context:** `{json.dumps(sample['context'], default=str)[:400]}`")
        out.append(f"- **Fingerprint:** `{g['fingerprint']}`")
        out.append("")
        if error.get("message"):
            out.append(f"**{error.get('type', 'Error')}:** {error['message']}")
            out.append("")
        if error.get("stack"):
            out.append("<details><summary>Stack trace</summary>")
            out.append("")
            out.append(_fence(error["stack"]))
            out.append("")
            out.append("</details>")
            out.append("")
        if sample.get("breadcrumbs"):
            out.append("<details><summary>What happened just before</summary>")
            out.append("")
            crumbs = sample["breadcrumbs"][-20:]
            out.append(_fence("\n".join(json.dumps(c, default=str) for c in crumbs), 2000))
            out.append("")
            out.append("</details>")
            out.append("")

    out.extend(render_traces(events))

    out.append("---")
    out.append("")
    out.append(
        "Raw events (full fidelity, including everything trimmed above) are in "
        "`diagnostics/backend/` and `diagnostics/frontend/`."
    )
    return "\n".join(out) + "\n"


def render_traces(events: list[dict], limit: int = 5) -> list[str]:
    """Show failing operations end to end: browser -> API -> WebSocket -> Gemini.

    This is the part that answers "what was the user actually doing when this
    broke". A backend stack trace on its own says a Gemini call timed out; the
    trace says it timed out inside the WebSocket opened by the student pressing
    "Go live" on a mock viva.
    """
    traced = [e for e in events if e.get("trace_id")]
    if not traced:
        return []

    by_trace: dict[str, list[dict]] = defaultdict(list)
    for event in traced:
        by_trace[str(event["trace_id"])].append(event)

    # Only traces that actually contain a failure are worth printing.
    failing = {
        trace: items
        for trace, items in by_trace.items()
        if any(str(e.get("level", "")).upper() in ("ERROR", "CRITICAL") for e in items)
    }
    if not failing:
        return []

    out = ["## Traces (what the user was doing)", ""]
    ordered = sorted(failing.items(), key=lambda kv: str(kv[1][-1].get("ts", "")), reverse=True)
    for trace, items in ordered[:limit]:
        items.sort(key=lambda e: str(e.get("ts", "")))
        span_of: dict[str, list[dict]] = defaultdict(list)
        for event in items:
            span_of[str(event.get("parent_span_id") or "")].append(event)

        out.append(f"### trace `{trace}` · {len(items)} events")
        out.append("")
        out.append("```")

        seen: set[int] = set()

        def emit(parent: str, depth: int) -> None:
            for event in span_of.get(parent, []):
                key = id(event)
                if key in seen or depth > 8:
                    continue
                seen.add(key)
                source = _SOURCE_LABEL.get(str(event.get("source")), str(event.get("source")))
                level = str(event.get("level", ""))
                marker = "x" if level.upper() in ("ERROR", "CRITICAL") else "-"
                ctx = event.get("context") or {}
                where = ctx.get("url_path") or ctx.get("route") or event.get("logger") or ""
                out.append(
                    f"{'  ' * depth}{marker} [{source}] {str(event.get('message'))[:70]}"
                    + (f"   ({where})" if where else "")
                )
                emit(str(event.get("span_id") or ""), depth + 1)

        # Roots are events whose parent span is absent from this trace.
        span_ids = {str(e.get("span_id") or "") for e in items}
        for event in items:
            parent = str(event.get("parent_span_id") or "")
            if parent not in span_ids and id(event) not in seen:
                seen.add(id(event))
                source = _SOURCE_LABEL.get(str(event.get("source")), str(event.get("source")))
                marker = "x" if str(event.get("level", "")).upper() in ("ERROR", "CRITICAL") else "-"
                out.append(f"{marker} [{source}] {str(event.get('message'))[:70]}")
                emit(str(event.get("span_id") or ""), 1)

        out.append("```")
        out.append("")
    return out


def build(root: Path, *, top: int = 12, hours: float | None = None) -> str:
    return render(load_events(root, hours), top=top, hours=hours)
