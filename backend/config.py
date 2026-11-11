from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator
from typing import Optional, List
import os


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # App
    app_name: str = "AI Stock Platform"
    debug: bool = True
    demo_mode: bool = False

    # Database
    database_url: str = "sqlite:///./ai_stock.db"
    redis_url: str = "redis://localhost:6379/0"

    # Market Data APIs
    finnhub_api_key: Optional[str] = None
    twelvedata_api_key: Optional[str] = None
    alpha_vantage_api_key: Optional[str] = None

    # Indian Broker APIs
    zerodha_api_key: Optional[str] = None
    zerodha_api_secret: Optional[str] = None
    upstox_api_key: Optional[str] = None
    upstox_api_secret: Optional[str] = None

    # AI — NVIDIA Nemotron (server-side only; never exposed to the browser)
    nvidia_api_key: Optional[str] = None
    nvidia_model: str = "nvidia/nemotron-3-super-120b-a12b"
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1"

    # CORS: Explicit origin list from environment (never "*")
    cors_origins: str = "http://localhost:3000"

    # Security: SECRET_KEY is strictly required. No default secrets.
    secret_key: str
    jwt_algorithm: str = "HS256"
    jwt_expiration_hours: int = 24

    @field_validator("secret_key")
    @classmethod
    def validate_secret_key(cls, v: str) -> str:
        if not v or not v.strip() or v == "change-me-please":
            raise ValueError("SECRET_KEY must be set in environment and cannot be empty or default.")
        return v.strip()

    @property
    def cors_origin_list(self) -> List[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def has_live_data(self) -> bool:
        return True


# Global settings instance - requires SECRET_KEY to be present in environment or .env
settings = Settings()
