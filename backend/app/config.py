from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Loaded from backend/.env. See .env.example for what's needed at each phase."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Phase 1: vision + USDA lookup
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.6-flash"
    usda_api_key: str = ""

    # Later phases (Supabase persistence, S3 storage) — optional until wired in
    supabase_url: str = ""
    supabase_service_key: str = ""
    # Temporary stand-in for real login (Phase 2 wires actual Supabase Auth).
    # Created by scripts/create_test_user.py.
    test_user_id: str = ""
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_region: str = ""
    s3_bucket_name: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
