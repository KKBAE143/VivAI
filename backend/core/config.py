"""Application settings loaded from environment variables."""
from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_anon_key: str = ""
    gemini_api_key: str = ""
    # Gemini Live API (real-time audio/video). Preview models; override via env if needed.
    gemini_live_model: str = "gemini-2.0-flash-live-001"
    gemini_live_voice: str = "Puck"
    storage_bucket: str = "uploads"
    cors_origins: str = "http://localhost:8080,http://localhost:5173"

    model_config = {"env_file": ("backend/.env", ".env"), "extra": "ignore"}

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
