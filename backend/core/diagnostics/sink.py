"""Append-only JSONL sink.

Design rules, all of them learned from how this kind of code fails:

* **Fail-open, always.** A diagnostics failure must never surface as an app
  failure. Every public method swallows everything. The worst outcome allowed
  here is "no diagnostics", never "no app".
* **Lazy open.** The file is opened on first write, not at import or configure
  time, so an unwritable directory cannot stop the app from booting.
* **Bounded.** Size-based rotation plus age-based pruning, because this writes
  to the user's working tree and nobody prunes a log they never look at.
* **Flood-resistant.** A per-fingerprint token bucket collapses repeats. A
  React render loop or a reconnect storm would otherwise write gigabytes in
  seconds and bury the one event that mattered.
"""
from __future__ import annotations

import json
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

from core.diagnostics import redact as _redact

SCHEMA_VERSION = 1


class JsonlSink:
    """One append-only JSONL file per day, with rotation and rate limiting."""

    def __init__(
        self,
        directory: str | Path,
        *,
        prefix: str = "events",
        max_file_mb: int = 20,
        max_files: int = 10,
        retention_days: int = 7,
        burst: int = 50,
        window_seconds: float = 60.0,
        env_literals: tuple[tuple[str, str], ...] = (),
    ) -> None:
        self.directory = Path(directory)
        self.prefix = prefix
        self.max_bytes = max(1, max_file_mb) * 1024 * 1024
        self.max_files = max(1, max_files)
        self.retention_days = max(1, retention_days)
        self.burst = max(1, burst)
        self.window_seconds = window_seconds
        self.env_literals = env_literals

        self._lock = threading.Lock()
        self._handle = None
        self._path: Path | None = None
        self._seq = 0
        self._disabled = False
        # fingerprint -> [window_start, count, suppressed]
        self._buckets: dict[str, list[float]] = {}
        self._pruned = False

    # -- lifecycle ---------------------------------------------------------- #
    def _today_path(self) -> Path:
        day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        return self.directory / f"{self.prefix}-{day}.jsonl"

    def _ensure_open(self) -> bool:
        """Open the current file if needed. Returns False if unusable."""
        if self._disabled:
            return False
        target = self._today_path()
        if self._handle is not None and self._path == target:
            if target.exists() and target.stat().st_size >= self.max_bytes:
                self._rotate()
            return True
        try:
            self.directory.mkdir(parents=True, exist_ok=True)
            if not self._pruned:
                self._prune()
                self._pruned = True
            self._close()
            self._handle = open(target, "a", encoding="utf-8", newline="\n")
            self._path = target
            return True
        except Exception:  # noqa: BLE001 — unwritable dir must not break the app
            self._disabled = True
            return False

    def _rotate(self) -> None:
        try:
            self._close()
            base = self._today_path()
            for index in range(self.max_files - 1, 0, -1):
                older = base.with_suffix(f".jsonl.{index}")
                newer = base.with_suffix(f".jsonl.{index - 1}") if index > 1 else base
                if newer.exists():
                    if older.exists():
                        older.unlink()
                    newer.rename(older)
            self._handle = open(base, "a", encoding="utf-8", newline="\n")
            self._path = base
        except Exception:  # noqa: BLE001
            self._disabled = True

    def _prune(self) -> None:
        cutoff = time.time() - self.retention_days * 86400
        try:
            for path in self.directory.glob(f"{self.prefix}-*.jsonl*"):
                try:
                    if path.stat().st_mtime < cutoff:
                        path.unlink()
                except Exception:  # noqa: BLE001
                    continue
        except Exception:  # noqa: BLE001
            pass

    def _close(self) -> None:
        try:
            if self._handle is not None:
                self._handle.close()
        except Exception:  # noqa: BLE001
            pass
        finally:
            self._handle = None

    def close(self) -> None:
        with self._lock:
            self._close()

    # -- rate limiting ------------------------------------------------------ #
    def _allow(self, key: str) -> tuple[bool, int]:
        """Token bucket. Returns (allowed, suppressed_count_to_report)."""
        now = time.monotonic()
        bucket = self._buckets.get(key)
        if bucket is None or now - bucket[0] > self.window_seconds:
            suppressed = int(bucket[2]) if bucket else 0
            self._buckets[key] = [now, 1, 0]
            return True, suppressed
        bucket[1] += 1
        if bucket[1] <= self.burst:
            return True, 0
        bucket[2] += 1
        return False, 0

    # -- writing ------------------------------------------------------------ #
    def write(self, event: dict) -> bool:
        """Redact, rate-limit and append one event. Never raises."""
        try:
            with self._lock:
                key = str(event.get("fingerprint") or event.get("message") or "")
                allowed, suppressed = self._allow(key)
                if not allowed:
                    return False
                if suppressed:
                    event = dict(event)
                    event["suppressed_since_last"] = suppressed

                if not self._ensure_open():
                    return False

                self._seq += 1
                payload = {
                    "v": SCHEMA_VERSION,
                    "ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
                    "seq": self._seq,
                    **event,
                }
                safe = _redact.redact_obj(payload, self.env_literals)
                line = json.dumps(safe, default=str, ensure_ascii=False)
                if len(line) > 32_768:
                    # Shed the least essential fields rather than drop the event.
                    trimmed = dict(safe) if isinstance(safe, dict) else {}
                    trimmed.pop("breadcrumbs", None)
                    line = json.dumps(trimmed, default=str, ensure_ascii=False)
                    if len(line) > 32_768:
                        trimmed.pop("context", None)
                        error = trimmed.get("error")
                        if isinstance(error, dict) and isinstance(error.get("stack"), str):
                            error["stack"] = error["stack"][:4000] + "…[truncated]"
                        line = json.dumps(trimmed, default=str, ensure_ascii=False)[:32_768]
                assert self._handle is not None
                self._handle.write(line + "\n")
                self._handle.flush()
                return True
        except Exception:  # noqa: BLE001 — the entire point of this module
            return False


def default_directory(configured: str) -> Path:
    """Resolve the sink directory relative to the REPO ROOT, not the cwd.

    uvicorn is started from ``backend/`` by start-app.ps1, so a bare relative
    path would scatter ``backend/diagnostics/`` and ``./diagnostics/`` depending
    on who launched the process.
    """
    path = Path(configured)
    if path.is_absolute():
        return path
    repo_root = Path(__file__).resolve().parents[3]
    return repo_root / path


def build_sink(settings, subdir: str = "backend") -> JsonlSink:
    """Construct a sink from app settings. Never raises."""
    directory = default_directory(settings.diagnostics_dir) / subdir
    literals = _redact.build_env_literals(
        extra=getattr(settings, "diagnostics_extra_redactions", "") or ""
    )
    return JsonlSink(
        directory,
        max_file_mb=getattr(settings, "diagnostics_max_file_mb", 20),
        max_files=getattr(settings, "diagnostics_max_files", 10),
        retention_days=getattr(settings, "diagnostics_retention_days", 7),
        env_literals=literals,
    )


__all__ = ["JsonlSink", "SCHEMA_VERSION", "build_sink", "default_directory", "os"]
