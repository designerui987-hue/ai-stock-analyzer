"""
Base classes and shared infrastructure for external research data providers.

Provides:
- Normalized `ProviderResponse` schema across all external providers
- Non-blocking async HTTP (`httpx.AsyncClient`) + `asyncio` locking/backoff
- Shared Redis + in-memory cache (`CacheLayer`) with bounded per-key async coalescing
  and optional cross-worker Redis coalescing locks
- Shared Redis atomic per-minute & daily quota counters (safe local fallback if Redis down)
- Separation of temporary HTTP 429 rate-limit cooldown (`Retry-After`) from daily exhaustion
- Per-attempt credit counting (including retries)
- Secret redaction in logs, error messages, and returned metadata
"""

import asyncio
from collections import OrderedDict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
import json
import logging
import threading
import time
from abc import ABC, abstractmethod
from typing import Any, Awaitable, Callable, Dict, Iterable, Optional, Tuple

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

MAX_COALESCE_LOCKS = 512

# Atomic check-and-increment Lua script for Redis quota enforcement.
# KEYS: [day_key, min_key, cooldown_key, daily_exhausted_key]
# ARGV: [weight, day_limit (-1 if none), min_limit (-1 if none), day_ttl, min_ttl, now_ts]
# Returns: [allowed (1|0), reason_code, day_used, min_used, cooldown_ttl]
_LUA_QUOTA_CONSUME = """
local day_key = KEYS[1]
local min_key = KEYS[2]
local cooldown_key = KEYS[3]
local daily_ex_key = KEYS[4]

local weight = tonumber(ARGV[1])
local day_limit = tonumber(ARGV[2])
local min_limit = tonumber(ARGV[3])
local day_ttl = tonumber(ARGV[4])
local min_ttl = tonumber(ARGV[5])

if redis.call('EXISTS', daily_ex_key) == 1 then
    local cur_day = tonumber(redis.call('GET', day_key) or '0')
    local cur_min = tonumber(redis.call('GET', min_key) or '0')
    return {0, 'daily_exhausted', cur_day, cur_min, 0}
end

local cd_ttl = redis.call('TTL', cooldown_key)
if cd_ttl and cd_ttl > 0 then
    local cur_day = tonumber(redis.call('GET', day_key) or '0')
    local cur_min = tonumber(redis.call('GET', min_key) or '0')
    return {0, 'cooldown', cur_day, cur_min, cd_ttl}
end

local cur_day = tonumber(redis.call('GET', day_key) or '0')
local cur_min = tonumber(redis.call('GET', min_key) or '0')

if day_limit >= 0 and (cur_day + weight) > day_limit then
    return {0, 'daily_limit', cur_day, cur_min, 0}
end

if min_limit >= 0 and (cur_min + weight) > min_limit then
    return {0, 'minute_limit', cur_day, cur_min, 0}
end

local new_day = redis.call('INCRBY', day_key, weight)
if new_day == weight then
    redis.call('EXPIRE', day_key, day_ttl)
end

local new_min = redis.call('INCRBY', min_key, weight)
if new_min == weight then
    redis.call('EXPIRE', min_key, min_ttl)
end

return {1, 'ok', new_day, new_min, 0}
"""


def redact_secrets(text: str, secrets: Iterable[Optional[str]] = ()) -> str:
    """Remove any configured secret tokens from strings before logging or returning."""
    if not text:
        return text
    cleaned = str(text)
    for sec in secrets:
        if sec and len(sec) >= 4:
            cleaned = cleaned.replace(sec, "[REDACTED]")
    return cleaned


def parse_retry_after(header_value: Optional[str], default_seconds: int = 60) -> int:
    """Parse HTTP Retry-After header (seconds or HTTP-date), clamped to [1, 3600]."""
    if not header_value:
        return default_seconds
    raw = str(header_value).strip()
    if raw.isdigit():
        return max(1, min(int(raw), 3600))
    try:
        target_dt = parsedate_to_datetime(raw)
        if target_dt.tzinfo is None:
            target_dt = target_dt.replace(tzinfo=timezone.utc)
        delta = int((target_dt - datetime.now(timezone.utc)).total_seconds())
        return max(1, min(delta, 3600))
    except Exception:
        return default_seconds


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
    exchange: Optional[str] = None
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
            "exchange": self.exchange,
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
    exchange: Optional[str] = None,
    source_url: Optional[str] = None,
) -> ProviderResponse:
    """Return a normalized unavailable, error, or quota_exhausted response."""
    return ProviderResponse(
        provider_id=provider_id,
        source=provider_id,
        data=None,
        instrument=instrument,
        exchange=exchange,
        observation_time=None,
        status=status,
        unavailable_reason=reason,
        freshness="UNAVAILABLE",
        source_url=source_url,
    )


class QuotaExhaustedError(Exception):
    """Raised when provider local/shared quota or upstream rate limit/quota is hit."""

    def __init__(self, message: str, retry_after_seconds: Optional[int] = None, is_daily: bool = False):
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds
        self.is_daily = is_daily


class BaseAdapter(ABC):
    """
    Shared infrastructure for typed async external provider adapters.

    Handles:
    - Shared Redis/in-memory cache (`CacheLayer`) respecting `caching_permitted`
    - Non-blocking `httpx.AsyncClient` requests + `asyncio.sleep` retries
    - Bounded per-key `asyncio.Lock` coalescing (`OrderedDict`) + optional cross-worker Redis locks
    - Atomic Redis quota counters (per-minute vs daily) with safe local fallback
    - Separate temporary 429 cooldown (`Retry-After`) from daily exhaustion
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

        # Process-local fallback counters (used only when Redis is unavailable)
        self._day_used = 0
        self._minute_used = 0
        self._day_window_start: Optional[datetime] = None
        self._minute_window_bucket: Optional[str] = None
        self._cooldown_until_epoch: float = 0.0
        self._daily_exhausted_day: Optional[str] = None
        self._counter_lock = threading.Lock()
        self._redis_warned = False

        # Bounded per-key async locks (evict idle oldest entries above MAX_COALESCE_LOCKS)
        self._coalesce_locks: "OrderedDict[str, asyncio.Lock]" = OrderedDict()

        self.last_refresh_at: Optional[str] = None
        self.last_health: str = "unverified"
        self._upstream_call_count: int = 0

    def _secrets_to_redact(self) -> Iterable[Optional[str]]:
        """Subclasses holding API keys override this to guarantee log/URL safety."""
        return ()

    def _redis_client(self):
        return getattr(self._cache, "_redis", None)

    def _warn_redis_fallback(self, exc: Exception) -> None:
        if not self._redis_warned:
            self._redis_warned = True
            logger.warning(
                "[%s] Redis quota/lock backend unavailable (%s); falling back to process-local counters.",
                self.provider_id,
                exc,
            )

    @staticmethod
    def _utc_buckets(now_utc: Optional[datetime] = None) -> Tuple[str, str, int]:
        now = now_utc or datetime.now(timezone.utc)
        day_str = now.strftime("%Y%m%d")
        min_str = now.strftime("%Y%m%d%H%M")
        tomorrow = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        ttl_day = max(60, int((tomorrow - now).total_seconds()) + 60)
        return day_str, min_str, ttl_day

    def _quota_keys(self, day_str: str, min_str: str) -> Tuple[str, str, str, str]:
        return (
            f"ext:quota:day:{self.provider_id}:{day_str}",
            f"ext:quota:min:{self.provider_id}:{min_str}",
            f"ext:quota:cooldown:{self.provider_id}",
            f"ext:quota:daily_exhausted:{self.provider_id}:{day_str}",
        )

    def _roll_local_windows(self, now_utc: datetime) -> None:
        current_utc_day = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)
        if self._day_window_start is None or current_utc_day > self._day_window_start:
            self._day_used = 0
            self._day_window_start = current_utc_day

        min_bucket = now_utc.strftime("%Y%m%d%H%M")
        if self._minute_window_bucket != min_bucket:
            self._minute_used = 0
            self._minute_window_bucket = min_bucket

    def _local_consume_quota(self, weight: int) -> Tuple[bool, str, Optional[int]]:
        now_utc = datetime.now(timezone.utc)
        day_str = now_utc.strftime("%Y%m%d")
        now_epoch = time.time()
        with self._counter_lock:
            self._roll_local_windows(now_utc)
            if self._daily_exhausted_day == day_str:
                self.last_health = "quota_exhausted"
                return False, "daily_exhausted", None
            if self._cooldown_until_epoch > now_epoch:
                rem = max(1, int(self._cooldown_until_epoch - now_epoch))
                self.last_health = "degraded"
                return False, "cooldown", rem
            if self._quota_per_day is not None and (self._day_used + weight) > self._quota_per_day:
                self.last_health = "quota_exhausted"
                return False, "daily_limit", None
            if self._quota_per_minute is not None and (self._minute_used + weight) > self._quota_per_minute:
                self.last_health = "degraded"
                return False, "minute_limit", max(1, 60 - now_utc.second)
            self._day_used += weight
            self._minute_used += weight
        return True, "ok", None

    def _sync_redis_consume_quota(self, redis_client: Any, weight: int) -> Tuple[bool, str, Optional[int]]:
        now_utc = datetime.now(timezone.utc)
        day_str, min_str, ttl_day = self._utc_buckets(now_utc)
        day_key, min_key, cd_key, ex_key = self._quota_keys(day_str, min_str)
        day_lim = self._quota_per_day if self._quota_per_day is not None else -1
        min_lim = self._quota_per_minute if self._quota_per_minute is not None else -1

        # Prefer atomic Lua script when supported (real Redis)
        if hasattr(redis_client, "eval"):
            try:
                res = redis_client.eval(
                    _LUA_QUOTA_CONSUME,
                    4,
                    day_key,
                    min_key,
                    cd_key,
                    ex_key,
                    weight,
                    day_lim,
                    min_lim,
                    ttl_day,
                    120,
                )
                allowed = int(res[0]) == 1
                reason = str(res[1])
                cd_ttl = int(res[4]) if len(res) > 4 and int(res[4]) > 0 else None
                if not allowed:
                    self.last_health = "quota_exhausted" if "daily" in reason else "degraded"
                return allowed, reason, cd_ttl
            except (NotImplementedError, AttributeError):
                # Fall through to basic Redis command emulation for simple test mocks
                pass

        # Fallback for fake Redis clients lacking Lua eval (still atomic per-command INCRBY)
        if redis_client.get(ex_key):
            self.last_health = "quota_exhausted"
            return False, "daily_exhausted", None
        if redis_client.get(cd_key):
            cd_ttl = redis_client.ttl(cd_key) if hasattr(redis_client, "ttl") else 60
            self.last_health = "degraded"
            return False, "cooldown", max(1, int(cd_ttl or 60))

        new_day = int(redis_client.incrby(day_key, weight))
        if new_day == weight and hasattr(redis_client, "expire"):
            redis_client.expire(day_key, ttl_day)
        if day_lim >= 0 and new_day > day_lim:
            redis_client.decrby(day_key, weight)
            self.last_health = "quota_exhausted"
            return False, "daily_limit", None

        new_min = int(redis_client.incrby(min_key, weight))
        if new_min == weight and hasattr(redis_client, "expire"):
            redis_client.expire(min_key, 120)
        if min_lim >= 0 and new_min > min_lim:
            redis_client.decrby(min_key, weight)
            redis_client.decrby(day_key, weight)
            self.last_health = "degraded"
            return False, "minute_limit", max(1, 60 - now_utc.second)

        return True, "ok", None

    async def check_and_consume_quota(self, credit_weight: int = 1) -> Tuple[bool, str, Optional[int]]:
        """
        Atomically check and consume `credit_weight` credits.
        Uses shared Redis across workers when available; safely falls back locally if down.
        """
        weight = max(1, int(credit_weight))
        redis_client = self._redis_client()
        if redis_client is not None:
            try:
                return await asyncio.to_thread(self._sync_redis_consume_quota, redis_client, weight)
            except Exception as exc:
                self._warn_redis_fallback(exc)
        return self._local_consume_quota(weight)

    async def mark_rate_limited(self, retry_after_seconds: int = 60) -> None:
        """
        Apply a temporary per-minute/upstream rate-limit cooldown WITHOUT wiping daily quota.
        """
        seconds = max(1, min(int(retry_after_seconds), 3600))
        self.last_health = "degraded"
        with self._counter_lock:
            self._cooldown_until_epoch = max(self._cooldown_until_epoch, time.time() + seconds)

        redis_client = self._redis_client()
        if redis_client is not None:
            try:
                cd_key = f"ext:quota:cooldown:{self.provider_id}"
                await asyncio.to_thread(redis_client.setex, cd_key, seconds, "1")
            except Exception as exc:
                self._warn_redis_fallback(exc)

    async def mark_daily_exhausted(self) -> None:
        """Mark daily quota as exhausted for the remainder of the current UTC day."""
        now_utc = datetime.now(timezone.utc)
        day_str, min_str, ttl_day = self._utc_buckets(now_utc)
        day_key, _, _, ex_key = self._quota_keys(day_str, min_str)
        self.last_health = "quota_exhausted"

        with self._counter_lock:
            self._roll_local_windows(now_utc)
            self._daily_exhausted_day = day_str
            if self._quota_per_day is not None:
                self._day_used = self._quota_per_day

        redis_client = self._redis_client()
        if redis_client is not None:
            try:
                def _mark():
                    redis_client.setex(ex_key, ttl_day, "1")
                    if self._quota_per_day is not None:
                        redis_client.set(day_key, str(self._quota_per_day))
                        if hasattr(redis_client, "expire"):
                            redis_client.expire(day_key, ttl_day)

                await asyncio.to_thread(_mark)
            except Exception as exc:
                self._warn_redis_fallback(exc)

    def quota_status(self) -> Dict[str, Any]:
        """Return estimated remaining daily quota, minute usage, cooldown, and UTC reset."""
        now_utc = datetime.now(timezone.utc)
        day_str, min_str, _ = self._utc_buckets(now_utc)
        day_key, min_key, cd_key, ex_key = self._quota_keys(day_str, min_str)
        next_reset = (
            now_utc.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
        ).isoformat()

        redis_client = self._redis_client()
        if redis_client is not None:
            try:
                raw_day = redis_client.get(day_key)
                raw_min = redis_client.get(min_key)
                day_used = int(raw_day or 0)
                min_used = int(raw_min or 0)
                daily_ex = bool(redis_client.get(ex_key))
                cd_active = bool(redis_client.get(cd_key))
                remaining = (
                    0
                    if daily_ex and self._quota_per_day is not None
                    else (max(0, self._quota_per_day - day_used) if self._quota_per_day is not None else None)
                )
                return {
                    "quota_per_day": self._quota_per_day,
                    "quota_per_minute": self._quota_per_minute,
                    "quota_used_today": day_used,
                    "quota_used_minute": min_used,
                    "quota_remaining": remaining,
                    "quota_is_estimated": self._quota_per_day is not None,
                    "rate_limited": cd_active,
                    "quota_scope": "redis_shared",
                    "reset_time": next_reset,
                }
            except Exception as exc:
                self._warn_redis_fallback(exc)

        with self._counter_lock:
            self._roll_local_windows(now_utc)
            daily_ex = self._daily_exhausted_day == day_str
            cd_active = self._cooldown_until_epoch > time.time()
            remaining = (
                0
                if daily_ex and self._quota_per_day is not None
                else (max(0, self._quota_per_day - self._day_used) if self._quota_per_day is not None else None)
            )
            return {
                "quota_per_day": self._quota_per_day,
                "quota_per_minute": self._quota_per_minute,
                "quota_used_today": self._day_used,
                "quota_used_minute": self._minute_used,
                "quota_remaining": remaining,
                "quota_is_estimated": self._quota_per_day is not None,
                "rate_limited": cd_active,
                "quota_scope": "process_local_fallback",
                "reset_time": next_reset,
            }

    def _get_coalesce_lock(self, cache_key: str) -> asyncio.Lock:
        lock = self._coalesce_locks.get(cache_key)
        if lock is not None:
            self._coalesce_locks.move_to_end(cache_key)
            return lock

        lock = asyncio.Lock()
        self._coalesce_locks[cache_key] = lock

        # Evict oldest unlocked entries to keep per-key storage strictly bounded
        if len(self._coalesce_locks) > MAX_COALESCE_LOCKS:
            to_evict = []
            for k, existing_lock in self._coalesce_locks.items():
                if k != cache_key and not existing_lock.locked():
                    to_evict.append(k)
                    if len(self._coalesce_locks) - len(to_evict) <= MAX_COALESCE_LOCKS:
                        break
            for k in to_evict:
                self._coalesce_locks.pop(k, None)
        return lock

    async def _get_cached_response(self, cache_key: str) -> Optional[ProviderResponse]:
        if not self.caching_permitted or self.cache_ttl_seconds <= 0:
            return None
        raw = await asyncio.to_thread(self._cache.get, cache_key)
        if not raw:
            return None
        try:
            payload = json.loads(raw)
            return ProviderResponse(
                provider_id=payload["provider_id"],
                source=payload.get("source", payload["provider_id"]),
                data=payload.get("data"),
                instrument=payload.get("instrument"),
                exchange=payload.get("exchange"),
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

    async def _set_cached_response(self, cache_key: str, response: ProviderResponse, ttl: int) -> None:
        if not self.caching_permitted or ttl <= 0 or response.status != "ok":
            return
        try:
            await asyncio.to_thread(
                self._cache.set, cache_key, ttl, json.dumps(response.to_dict())
            )
        except Exception as exc:
            logger.warning("[%s] Failed to write cache: %s", self.provider_id, exc)

    async def _try_acquire_redis_lock(self, lock_key: str, ttl_seconds: int = 15) -> bool:
        redis_client = self._redis_client()
        if redis_client is None:
            return True
        try:
            return bool(await asyncio.to_thread(redis_client.set, lock_key, "1", nx=True, ex=ttl_seconds))
        except Exception as exc:
            self._warn_redis_fallback(exc)
            return True

    async def _release_redis_lock(self, lock_key: str) -> None:
        redis_client = self._redis_client()
        if redis_client is None or not hasattr(redis_client, "delete"):
            return
        try:
            await asyncio.to_thread(redis_client.delete, lock_key)
        except Exception:
            pass

    async def _cached_coalesced_fetch(
        self,
        cache_key: str,
        fetcher: Callable[[], Awaitable[ProviderResponse]],
        ttl_override: Optional[int] = None,
        skip_cache: bool = False,
    ) -> ProviderResponse:
        """
        Read from shared cache if permitted; otherwise coalesce concurrent requests
        both in-process (`asyncio.Lock`) and across workers via Redis lock.
        """
        full_key = f"ext:{self.provider_id}:{cache_key}"

        if not skip_cache:
            cached = await self._get_cached_response(full_key)
            if cached is not None:
                return cached

        lock = self._get_coalesce_lock(full_key)
        async with lock:
            if not skip_cache:
                cached = await self._get_cached_response(full_key)
                if cached is not None:
                    return cached

            redis_lock_key = f"ext:lock:{full_key}"
            acquired_dist_lock = await self._try_acquire_redis_lock(redis_lock_key)
            if not acquired_dist_lock and not skip_cache:
                # Wait briefly for peer worker to populate shared cache
                for _ in range(10):
                    await asyncio.sleep(0.1)
                    cached = await self._get_cached_response(full_key)
                    if cached is not None:
                        return cached

            try:
                response = await fetcher()
            finally:
                if acquired_dist_lock:
                    await self._release_redis_lock(redis_lock_key)

            if response.status == "ok":
                self.last_refresh_at = response.received_at
                self.last_health = "healthy"
                ttl = ttl_override if ttl_override is not None else self.cache_ttl_seconds
                await self._set_cached_response(full_key, response, ttl)
            elif response.status == "quota_exhausted":
                # Keep "quota_exhausted" only when daily exhausted; temporary 429 cooldown marks "degraded"
                if self.last_health not in ("quota_exhausted", "disabled"):
                    self.last_health = "degraded"
            elif self.last_health not in ("quota_exhausted", "disabled"):
                self.last_health = "degraded"
            return response

    async def _make_request(
        self,
        url: str,
        params: Optional[Dict[str, Any]] = None,
        credit_weight: int = 1,
    ) -> Any:
        """
        Execute bounded non-blocking HTTP GET.
        Counts EVERY upstream attempt (including retries) against quota.
        Separates HTTP 429 rate-limit cooldown (`Retry-After`) from daily exhaustion.
        """
        secrets = tuple(self._secrets_to_redact())
        last_exc: Optional[Exception] = None

        async with httpx.AsyncClient(
            timeout=self._timeout_seconds,
            follow_redirects=True,
        ) as client:
            for attempt in range(self._max_retries + 1):
                allowed, reason, retry_after = await self.check_and_consume_quota(
                    credit_weight=credit_weight
                )
                if not allowed:
                    is_daily = "daily" in reason
                    msg = (
                        f"{self.provider_id} daily quota exhausted"
                        if is_daily
                        else f"{self.provider_id} rate limit active (retry in {retry_after or 60}s)"
                    )
                    raise QuotaExhaustedError(
                        msg, retry_after_seconds=retry_after, is_daily=is_daily
                    )

                try:
                    self._upstream_call_count += 1
                    resp = await client.get(url, params=params or {})

                    if resp.status_code == 429:
                        ra_secs = parse_retry_after(resp.headers.get("Retry-After"), default_seconds=60)
                        await self.mark_rate_limited(ra_secs)
                        raise QuotaExhaustedError(
                            f"{self.provider_id} HTTP 429 rate limit (Retry-After {ra_secs}s)",
                            retry_after_seconds=ra_secs,
                            is_daily=False,
                        )

                    resp.raise_for_status()
                    try:
                        return resp.json()
                    except ValueError as json_exc:
                        raise RuntimeError(
                            f"Malformed JSON payload from {self.provider_id}: {json_exc}"
                        ) from None
                except QuotaExhaustedError:
                    raise
                except httpx.HTTPStatusError as exc:
                    safe_msg = redact_secrets(str(exc), secrets)
                    if exc.response.status_code >= 500 and attempt < self._max_retries:
                        await asyncio.sleep(min(2.0, 0.5 * (2 ** attempt)))
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
                        await asyncio.sleep(min(2.0, 0.5 * (2 ** attempt)))
                        last_exc = RuntimeError(safe_msg)
                        continue
                    raise RuntimeError(safe_msg) from None
                except Exception as exc:
                    safe_msg = redact_secrets(str(exc), secrets)
                    raise RuntimeError(safe_msg) from None

        raise last_exc or RuntimeError(f"{self.provider_id} upstream request failed")

    @abstractmethod
    async def fetch(self, **kwargs) -> ProviderResponse:
        pass
