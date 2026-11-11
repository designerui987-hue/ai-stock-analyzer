"""
GNews Indian News Search Adapter — STRICTLY DEVELOPMENT ONLY.

Official docs: https://docs.gnews.io/ & https://gnews.io/terms
Free tier limits: 100 requests/day (resets 00:00 UTC), max 10 articles/request,
                  12-hour article delay, 250-char truncated content, last 30 days only.
Configuration: Read strictly via central validated `Settings`.
Dev gate: Explicit `APP_ENV=development` (or `dev`) AND `GNEWS_DEV_MODE=true`.
Unknown or non-development environments MUST keep this disabled.

CRITICAL COMPLIANCE & WORKFLOW BOUNDARY:
- GNews free plan strictly PROHIBITS production deployment and commercial use.
- Headlines carry a 12-hour delay on the free tier and MUST NEVER trigger trading entries.
"""

import logging
from typing import Iterable, List, Optional

import httpx

from config import Settings, get_settings
from services.external_providers.base import (
    BaseAdapter,
    ProviderResponse,
    QuotaExhaustedError,
    make_unavailable,
    redact_secrets,
)

logger = logging.getLogger("external_providers.gnews")

PROVIDER_ID = "gnews"
BASE_URL = "https://gnews.io/api/v4"


class GNewsAdapter(BaseAdapter):
    """Async development-only news search adapter with 12h delayed headlines."""

    provider_id = PROVIDER_ID
    cache_ttl_seconds = 900
    caching_permitted = True

    def __init__(self, cache=None, app_settings: Optional[Settings] = None):
        super().__init__(quota_per_day=100, quota_per_minute=None, cache=cache)
        self._settings: Settings = app_settings or get_settings(reload=True)
        self._api_key: Optional[str] = (self._settings.gnews_api_key or "").strip() or None
        self._dev_mode: bool = bool(self._settings.gnews_dev_mode)
        self.last_health = "unverified" if self.is_enabled else "disabled"

    def _secrets_to_redact(self) -> Iterable[Optional[str]]:
        return (self._api_key,)

    @property
    def is_explicit_dev_env(self) -> bool:
        return self._settings.is_explicit_development

    @property
    def is_enabled(self) -> bool:
        return self.is_explicit_dev_env and self._dev_mode and bool(self._api_key)

    def _check_dev_gate(self) -> Optional[ProviderResponse]:
        if not self.is_explicit_dev_env or not self._dev_mode:
            return make_unavailable(
                PROVIDER_ID,
                (
                    "GNews free plan terms prohibit production/commercial use. "
                    "Requires explicit APP_ENV=development and GNEWS_DEV_MODE=true."
                ),
            )
        if not self._api_key:
            return make_unavailable(PROVIDER_ID, "GNEWS_API_KEY not configured.")
        return None

    async def search_news(
        self,
        query: str,
        max_results: int = 10,
        skip_cache: bool = False,
    ) -> ProviderResponse:
        """
        Search Indian financial headlines (development only, 12-hour free-tier delay).
        """
        gate = self._check_dev_gate()
        if gate is not None:
            return gate

        clean_q = query.strip()
        if len(clean_q) < 2:
            return make_unavailable(PROVIDER_ID, "News query must be at least 2 characters.")

        lim = max(1, min(int(max_results), 10))
        cache_key = f"search:{clean_q.lower()}:{lim}"

        async def _fetch() -> ProviderResponse:
            params = {
                "q": clean_q,
                "lang": "en",
                "country": "in",
                "max": lim,
                "apikey": self._api_key,
            }
            try:
                raw = await self._make_request(f"{BASE_URL}/search", params=params, credit_weight=1)
            except QuotaExhaustedError as exc:
                return make_unavailable(PROVIDER_ID, str(exc), status="quota_exhausted")
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code == 403:
                    await self.mark_daily_exhausted()
                    return make_unavailable(
                        PROVIDER_ID,
                        "GNews daily quota (100 req/day) or plan restriction reached.",
                        status="quota_exhausted",
                    )
                safe_err = redact_secrets(str(exc), self._secrets_to_redact())
                return make_unavailable(PROVIDER_ID, f"Request failed: {safe_err}")
            except Exception as exc:
                safe_err = redact_secrets(str(exc), self._secrets_to_redact())
                return make_unavailable(PROVIDER_ID, f"Request failed: {safe_err}")

            if not isinstance(raw, dict):
                return make_unavailable(PROVIDER_ID, "Malformed non-object response from GNews.")

            if raw.get("errors"):
                err_text = redact_secrets(str(raw["errors"]), self._secrets_to_redact())
                return make_unavailable(PROVIDER_ID, f"GNews error: {err_text}", status="error")

            articles = raw.get("articles")
            if articles is None:
                articles = []
            if not isinstance(articles, list):
                return make_unavailable(PROVIDER_ID, "Malformed articles list from GNews.")

            parsed: List[dict] = []
            seen_urls = set()
            for article in articles:
                if not isinstance(article, dict):
                    continue
                url = article.get("url")
                if url and url in seen_urls:
                    continue
                if url:
                    seen_urls.add(url)
                pub_at = article.get("publishedAt") or None
                src = article.get("source") if isinstance(article.get("source"), dict) else {}
                parsed.append({
                    "title": article.get("title"),
                    "description": article.get("description"),
                    "url": url,
                    "source_name": src.get("name"),
                    "source_url": src.get("url"),
                    "published_at": pub_at,
                })

            most_recent_pub = parsed[0].get("published_at") if parsed else None

            return ProviderResponse(
                provider_id=PROVIDER_ID,
                source=PROVIDER_ID,
                data={
                    "query": clean_q,
                    "articles": parsed,
                    "total_articles": raw.get("totalArticles", len(parsed)),
                    "delay_notice": "12-hour free-tier delay",
                    "disclaimer": (
                        "DEVELOPMENT ONLY — Free-tier GNews articles are delayed up to 12 hours "
                        "and NEVER permitted in production or as trading entry triggers."
                    ),
                },
                instrument=clean_q,
                observation_time=most_recent_pub,
                published_at=most_recent_pub,
                freshness="DELAYED",
                status="ok",
                source_url="https://docs.gnews.io/endpoints/search-endpoint",
            )

        return await self._cached_coalesced_fetch(cache_key, _fetch, skip_cache=skip_cache)

    async def fetch(self, **kwargs) -> ProviderResponse:
        return await self.search_news(kwargs.get("query", "NSE India"))


gnews = GNewsAdapter()
