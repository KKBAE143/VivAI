# Diagnostics

Automatic error capture for local development. Everything in this folder except
this file and `.gitkeep` is **gitignored** — it is local-only data.

## How to use it

1. Run the app as usual (`start-app.bat`).
2. Reproduce the bug.
3. Run **`diagnose.bat`** in the project root.
4. Hand over `diagnostics/REPORT.md`.

That's it. Nothing needs to be enabled or remembered while you use the app.

```
diagnose.bat              everything captured, top 12 problems
diagnose.bat -Hours 2     only the last 2 hours
diagnose.bat -Top 25      detail more problems
diagnose.bat -Clear       wipe the sink and start fresh
diagnose.bat -Open        open the report when it's done
```

## What's in here

| Path | What it is |
|---|---|
| `REPORT.md` | The generated digest. **This is the file to share.** |
| `backend/events-*.jsonl` | Raw backend events, one JSON object per line |
| `frontend/events-*.jsonl` | Raw browser + server-render events |

The `.jsonl` files are the full-fidelity record; `REPORT.md` groups them by
fingerprint so a bug that fired 87 times is one section with a count, not 87
near-identical blocks.

## What gets captured

Backend: every unhandled exception (HTTP and WebSocket), every `WARNING`+ log
line with its stack, failed Gemini connections, failed report builds, failed
session finalization, and background-task deaths that would otherwise only
print "Task exception was never retrieved" to a console window nobody sees.

Frontend: uncaught errors, unhandled promise rejections, React render errors,
failed API calls, and live-session WebSocket failures — with breadcrumbs of what
happened just before.

Backend and frontend events for the same failure share a `request_id`, so the
two halves of a problem line up.

## Secrets

Everything is redacted on the way to disk: JWTs (including the one in the live
session's `?token=` URL), API keys, passwords, emails, and the literal values of
any secret-looking environment variable. Audio/image payloads are truncated to a
byte count. `context` is an allowlist, so unrecognised fields are dropped rather
than scrubbed.

`diagnose.bat` runs an independent leak scan over the finished files afterwards
and **fails loudly** if anything credential-shaped survived. If that ever fires,
do not share the files — run `diagnose.bat -Clear`.

## Production

Capture is local-development only. A production build contains **no ingest
endpoint and no code path that can send anything** — the transport is
statically eliminated at build time. (A couple of KB of unreachable reporter
code does remain in the bundle, because `report()` is referenced from about ten
call sites; it can never run.)

## Turning it off

Set `DIAGNOSTICS_ENABLED=false` in `backend/.env`. Nothing else changes; the
whole subsystem is fail-open, so it can also be disabled by simply breaking —
the app never depends on it.
