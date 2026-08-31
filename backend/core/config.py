"""Application settings loaded from environment variables."""
from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_anon_key: str = ""
    gemini_api_key: str = ""
    # Gemini Live API (real-time audio/video). Preview models; override via env if needed.
    gemini_live_model: str = "gemini-3.1-flash-live-preview"
    gemini_live_voice: str = "Puck"
    storage_bucket: str = "uploads"
    cors_origins: str = "http://localhost:8080,http://localhost:5173"
    # Presentation ingestion runs inside the existing API process by default,
    # so hosts do not need a second service or Docker container.
    presentation_worker_enabled: bool = True

    # --- Live-session behavior flags / tunables (REVIEW v2 / R7) ---
    # Optional long-session re-anchor nudge (speculative; enable only if drift
    # is observed in QA/telemetry).
    live_reanchor: bool = False
    # Live system-instruction char budget (two-tier prompt architecture). The
    # registry char-budget test asserts every scenario x persona x mode stays
    # under this; also emitted as a per-session metric for monitoring.
    prompt_max_chars: int = 5000
    # Raw session_events retention (days) for the pruning job (R8). The report
    # JSON is the durable artifact; raw per-turn events are operational data.
    session_events_retention_days: int = 90

    # --- Local diagnostics capture ---
    # Writes redacted error events to <repo>/diagnostics/ so a failure can be
    # handed over as a file instead of remembered. Local-developer tooling: the
    # directory is gitignored, and the whole subsystem is fail-open, so turning
    # it off (or having it fail) changes nothing else about how the app runs.
    diagnostics_enabled: bool = True
    diagnostics_dir: str = "diagnostics"
    # Only WARNING and above are captured; INFO is far too chatty for a file
    # that a human is expected to read end to end.
    diagnostics_level: str = "WARNING"
    diagnostics_max_file_mb: int = 20
    diagnostics_max_files: int = 10
    diagnostics_retention_days: int = 7
    # Comma-separated extra literals to scrub — an escape hatch for a secret
    # the redactor does not recognise by shape or env-var name.
    diagnostics_extra_redactions: str = ""

    model_config = {"env_file": ("backend/.env", ".env"), "extra": "ignore"}

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
