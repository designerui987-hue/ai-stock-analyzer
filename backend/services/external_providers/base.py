"""
Base classes and shared infrastructure for external research data providers.

Provides:
- Normalized `ProviderResponse` schema across all external providers
- Shared backend caching (reuses Redis/in-memory `CacheLayer`) when caching is permitted
- Request coalescing per cache key so concurrent identical requests trigger a single upstream call
- Bounded retries with exponential backoff and explicit timeouts
- Provider-specific credit-weighted quota accounting and reset window tracking
- Secret redaction in logs, error messages, and returned metadata
"""

import json
import logging
import threading
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, Iterable, Optional

import httpx

from services.market_data_service import CacheLayer, market_data_service

logger = logging.getLogger("external_providers")

ALLOWED_RESEARCH_FRESHNESS = frozenset({
    "REFERENCE_RATE",
    "END_OF_DAY",
    "NAV",
    "DELAYED",
    "UNAVAILABLE",
})


def redact_secrets(text: str, secrets: Iterable[Optional[str]] = ()) -> str:
    """Remove any configured secret tokens from strings before logging or returning."""
    if not text:
        return text
    cleaned = str(text)
    for sec in secrets:
        if sec and len(sec) >= 4:
            cleaned = cleaned.replace(sec, "[REDACTED]")
    return cleaned


@dataclass
class ProviderResponse:
    """
    Normalized response contract for all external research data providers.

    Invariants:
    - `observation_time` is strictly derived from upstream data; `None` if unknown.
      NEVER replace an unknown `observation_time` with `received_at`.
    - `freshness` is NEVER `"LIVE"` for any external research/reference provider.
    - `source` and `provider_id` identify the provider; `source_url` never contains secrets.
    """

    provider_id: str
    data: Any
    source: Optional[str] = None
    instrument: Optional[str] = None
    currency: Optional[str] = None
    unit: Optional[str] = None
    observation_time: Optional[str] = None
    published_at: Optional[str] = None
    received_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    status: str = "ok"  # "ok" | "unavailable" | "quota_exhausted" | "error"
    unavailable_reason: Optional[str] = None
    freshness: str = "UNAVAILABLE"  # REFERENCE_RATE | END_OF_DAY | NAV | DELAYED | UNAVAILABLE
    source_url: Optional[str] = None
    cached: bool = False

    def __post_init__(self) -> None:
        if self.source is None:
            self.source = self.provider_id
        if self.freshness not in ALLOWED_RESEARCH_FRESHNESS:
            # Guard against accidental promotion of delayed/research data to LIVE
            self.freshness = "UNAVAILABLE"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "provider_id": self.provider_id,
            "source": self.source,
            "data": self.data,
            "instrument": self.instrument,
            "currency": self.currency,
            "unit": self.unit,
            "observation_time": self.observation_time,
            "published_at": self.published_at,
            "received_at": self.received_at,
            "status": self.status,
            "unavailable_reason": self.unavailable_reason,
            "freshness": self.freshness,
            "source_url": self.source_url,
            "cached": self.cached,
        }


def make_unavailable(
    provider_id: str,
    reason: str,
    status: str = "unavailable",
    instrument: Optional[str] = None,
    source_url: Optional[str] = None,
) -> ProviderResponse:
    """Return a normalized unavailable or quota_exhausted response."""
    return ProviderResponse(
        provider_id=provider_id,
        source=provider_id,
        data=None,
        instrument=instrument,
        observation_time=None,
        status=status,
        unavailable_reason=reason,
        freshness="UNAVAILABLE",
        source_url=source_url,
    )


class QuotaExhaustedError(Exception):
    """Raised when provider local quota or upstream HTTP 429/quota is hit."""


class BaseAdapter(ABC):
    """
    Shared infrastructure for typed external provider adapters.

    Handles:
    - Shared Redis/in-memory cache (respecting `caching_permitted`)
    - Request coalescing per cache key using per-key locks
    - Credit-weighted daily and per-minute quota tracking with reset times
    - Bounded retries + exponential backoff with secret redaction
    """

    provider_id: str = "base"
    cache_ttl_seconds: int = 3600
    caching_permitted: bool = True

    def __init__(
        self,
        quota_per_day: Optional[int] = None,
        quota_per_minute: Optional[int] = None,
        cache: Optional[CacheLayer] = None,
        timeout_seconds: float = 8.0,
        max_retries: int = 2,
    ):
        self._quota_per_day = quota_per_day
        self._quota_per_minute = quota_per_minute
        self._cache = cache or market_data_service.cache
        self._timeout_seconds = timeout_seconds
        self._max_retries = max_retries

        self._day_used = 0
        self._minute_used = 0
        self._day_window_start: Optional[datetime] = None
        self._minute_window_start: float = 0.0
        self._counter_lock = threading.Lock()

        self._coalesce_locks: Dict[str, threading.Lock] = {}
        self._coalesce_mutex = threading.Lock()

        self.last_refresh_at: Optional[str] = None
        self.last_health: str = "unknown"
        self._upstream_call_count: int = 0

    def _secrets_to_redact(self) -> Iterable[Optional[str]]:
        """Subclasses holding API keys override this to guarantee log/URL safety."""
        return ()

    def _roll_quota_windows(self, now_utc: datetime, now_mono: float) -> None:
        """Reset daily/minute counters cleanly on window boundaries (UTC day / 60s)."""
        current_utc_day = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)
        if self._day_window_start is None or current_utc_day > self._day_window_start:
            self._day_used = 0
            self._day_window_start = current_utc_day

        if now_mono - self._minute_window_start >= 60.0:
            self._minute_used = 0
            self._minute_window_start = now_mono

    def check_and_consume_quota(self, credit_weight: int = 1) -> bool:
        """Consume `credit_weight` credits if available; return False if exhausted."""
        weight = max(1, int(credit_weight))
        now_utc = datetime.now(timezone.utc)
        now_mono = time.monotonic()
        with self._counter_lock:
            self._roll_quota_windows(now_utc, now_mono)
            if self._quota_per_day is not None and (self._day_used + weight) > self._quota_per_day:
                self.last_health = "quota_exhausted"
                return False
            if self._quota_per_minute is not None and (self._minute_used + weight) > self._quota_per_minute:
                self.last_health = "quota_exhausted"
                return False
            self._day_used += weight
            self._minute_used += weight
        return True

    def mark_quota_exhausted(self) -> None:
        """Force local quota state to exhausted when upstream signals 429 or cap reached."""
        now_utc = datetime.now(timezone.utc)
        now_mono = time.monotonic()
        with self._counter_lock:
            self._roll_quota_windows(now_utc, now_mono)
            if self._quota_per_day is not None:
                self._day_used = self._quota_per_day
            self.last_health = "quota_exhausted"

    def quota_status(self) -> Dict[str, Any]:
        """Return estimated remaining daily quota and next UTC midnight reset."""
        now_utc = datetime.now(timezone.utc)
        now_mono = time.monotonic()
        with self._counter_lock:
            self._roll_quota_windows(now_utc, now_mono)
            remaining = None
            if self._quota_per_day is not None:
                remaining = max(0, self._quota_per_day - self._day_used)
            next_reset = (
                (self._day_window_start + timedelta(days=1)).isoformat()
                if self._day_window_start is not None
                else None
            )
            return {
                "quota_per_day": self._quota_per_day,
                "quota_per_minute": self._quota_per_minute,
                "quota_used_today": self._day_used,
                "quota_remaining": remaining,
                "quota_is_estimated": self._quota_per_day is not None,
                "reset_time": next_reset,
            }

    def _get_coalesce_lock(self, cache_key: str) -> threading.Lock:
        with self._coalesce_mutex:
            lock = self._coalesce_locks.get(cache_key)
            if lock is None:
                lock = threading.Lock()
                self._coalesce_locks[cache_key] = lock
            return lock

    def _get_cached_response(self, cache_key: str) -> Optional[ProviderResponse]:
        if not self.caching_permitted or self.cache_ttl_seconds <= 0:
            return None
        raw = self._cache.get(cache_key)
        if not raw:
            return None
        try:
            payload = json.loads(raw)
            return ProviderResponse(
                provider_id=payload["provider_id"],
                source=payload.get("source", payload["provider_id"]),
                data=payload.get("data"),
                instrument=payload.get("instrument"),
                currency=payload.get("currency"),
                unit=payload.get("unit"),
                observation_time=payload.get("observation_time"),
                published_at=payload.get("published_at"),
                received_at=payload.get("received_at", datetime.now(timezone.utc).isoformat()),
                status=payload.get("status", "ok"),
                unavailable_reason=payload.get("unavailable_reason"),
                freshness=payload.get("freshness", "UNAVAILABLE"),
                source_url=payload.get("source_url"),
                cached=True,
            )
        except Exception:
            return None

    def _set_cached_response(self, cache_key: str, response: ProviderResponse) -> None:
        if not self.caching_permitted or self.cache_ttl_seconds <= 0:
            return
        if response.status != "ok":
            return
        try:
            self._cache.set(cache_key, self.cache_ttl_seconds, json.dumps(response.to_dict()))
        except Exception as exc:
            logger.warning("[%s] Failed to write cache: %s", self.provider_id, exc)

    def _cached_coalesced_fetch(
        self,
        cache_key: str,
        fetcher: Callable[[], ProviderResponse],
        ttl_override: Optional[int] = None,
        skip_cache: bool = False,
    ) -> ProviderResponse:
        """
        Read from cache if permitted, otherwise coalesce concurrent upstream calls
        for `cache_key` behind a single lock so only one upstream call runs.
        """
        full_key = f"ext:{self.provider_id}:{cache_key}"

        if not skip_cache:
            cached = self._get_cached_response(full_key)
            if cached is not None:
                return cached

        lock = self._get_coalesce_lock(full_key)
        with lock:
            # Re-check cache after acquiring lock (handles concurrent thundering herd)
            if not skip_cache:
                cached = self._get_cached_response(full_key)
                if cached is not None:
                    return cached

            response = fetcher()
            if response.status == "ok":
                self.last_refresh_at = response.received_at
                self.last_health = "healthy"
                if self.caching_permitted:
                    ttl = ttl_override if ttl_override is not None else self.cache_ttl_seconds
                    if ttl > 0:
                        try:
                            self._cache.set(full_key, ttl, json.dumps(response.to_dict()))
                        except Exception as exc:
                            logger.warning("[%s] Failed to cache response: %s", self.provider_id, exc)
            elif response.status == "quota_exhausted":
                self.last_health = "quota_exhausted"
            elif self.last_health not in ("quota_exhausted", "disabled"):
                self.last_health = "degraded"
            return response

    def _make_request(
        self,
        url: str,
        params: Optional[Dict[str, Any]] = None,
        credit_weight: int = 1,
    ) -> Any:
        """
        Execute bounded HTTP GET with credit-weighted quota check, redirects,
        timeouts, and exponential backoff retries. Redacts secrets from errors.
        """
        if not self.check_and_consume_quota(credit_weight=credit_weight):
            raise QuotaExhaustedError(f"{self.provider_id} quota exhausted")

        secrets = tuple(self._secrets_to_redact())
        last_exc: Optional[Exception] = None

        for attempt in range(self._max_retries + 1):
            try:
                self._upstream_call_count += 1
                with httpx.Client(
                    timeout=self._timeout_seconds,
                    follow_redirects=True,
                ) as client:
                    resp = client.get(url, params=params or {})

                if resp.status_code == 429:
                    self.mark_quota_exhausted()
                    raise QuotaExhaustedError(f"{self.provider_id} HTTP 429 rate limit")

                resp.raise_for_status()
                return resp.json()
            except QuotaExhaustedError:
                raise
            except httpx.HTTPStatusError as exc:
                safe_msg = redact_secrets(str(exc), secrets)
                if exc.response.status_code >= 500 and attempt < self._max_retries:
                    time.sleep(min(2.0, 0.5 * (2 ** attempt)))
                    last_exc = httpx.HTTPStatusError(
                        safe_msg, request=exc.request, response=exc.response
                    )
                    continue
                raise httpx.HTTPStatusError(
                    safe_msg, request=exc.request, response=exc.response
                ) from None
            except (httpx.TimeoutException, httpx.ConnectError) as exc:
                safe_msg = redact_secrets(str(exc), secrets)
                if attempt < self._max_retries:
                    time.sleep(min(2.0, 0.5 * (2 ** attempt)))
                    last_exc = RuntimeError(safe_msg)
                    continue
                raise RuntimeError(safe_msg) from None
            except Exception as exc:
                safe_msg = redact_secrets(str(exc), secrets)
                raise RuntimeError(safe_msg) from None

        raise last_exc or RuntimeError(f"{self.provider_id} upstream request failed")

    @abstractmethod
    def fetch(self, **kwargs) -> ProviderResponse:
        pass
