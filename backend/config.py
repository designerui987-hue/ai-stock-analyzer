from pydantic_settings import BaseSettings
from typing import Optional
import os


class Settings(BaseSettings):
    # App
    app_name: str = "AI Stock Platform"
    debug: bool = True

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

    # AI
    openai_api_key: Optional[str] = None

    # CORS
    cors_origins: str = "http://localhost:3000"

    # Security
    secret_key: str = os.getenv("SECRET_KEY", "change-me-please")
    jwt_algorithm: str = "HS256"
    jwt_expiration_hours: int = 24

    @property
    def has_live_data(self) -> bool:
        return bool(self.finnhub_api_key or self.twelvedata_api_key or self.alpha_vantage_api_key)

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
