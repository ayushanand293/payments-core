from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "payments-core"
    app_env: str = "development"
    database_url: str = Field(default="postgresql+psycopg://payments:payments@localhost:5432/payments")
    redis_url: str = Field(default="redis://localhost:6379/0")
    demo_secret: str = Field(default="change-me")
    auto_seed: bool = True
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
