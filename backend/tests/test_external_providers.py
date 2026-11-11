"""
Deterministic Fixture, Concurrency, Quota & Security Tests for External Research Data Providers.

All tests run without live upstream network calls using fixtures and mocks so CI
passes reproducibly regardless of optional API keys or external outages.
"""

import asyncio
import json
import threading
import time
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient

from auth.security import create_access_token
from config import Settings
from main import app
from services.external_providers.alpha_vantage_adapter import AlphaVantageAdapter
from services.external_providers.base import MAX_COALESCE_LOCKS, ProviderResponse
from services.external_providers.capability_registry import CapabilityRegistry
from services.external_providers.frankfurter_adapter import FrankfurterAdapter
from services.external_providers.gnews_adapter import GNewsAdapter
from services.external_providers.guardrails import (
    can_fallback_market_series,
    enforce_non_live_freshness,
    validate_currency_and_unit,
    validate_observation_timestamp,
)
from services.external_providers.mfapi_adapter import MFAPIAdapter
from services.external_providers.twelve_data_adapter import TwelveDataAdapter
from services.external_providers.worldbank_adapter import WorldBankAdapter
from services.market_data_service import CacheLayer, InMemoryCache


class FakeRedis:
    """Thread-safe minimal Redis mock supporting atomic counters, TTL, and NX locks."""

    def __init__(self):
        self._store = {}
        self._lock = threading.Lock()

    def get(self, key):
        with self._lock:
            return self._store.get(key)

    def set(self, key, value, nx=False, ex=None):
        with self._lock:
            if nx and key in self._store:
                return False
            self._store[key] = str(value)
            return True

    def setex(self, key, ttl, value):
        return self.set(key, value, ex=ttl)

    def incr(self, key):
        return self.incrby(key, 1)

    def incrby(self, key, amount):
        with self._lock:
            cur = int(self._store.get(key, 0))
            nxt = cur + int(amount)
            self._store[key] = str(nxt)
            return nxt

    def decrby(self, key, amount):
        return self.incrby(key, -int(amount))

    def expire(self, key, ttl):
        return True

    def ttl(self, key):
        return 30 if key in self._store else -2

    def delete(self, key):
        with self._lock:
            self._store.pop(key, None)
        return 1


def make_isolated_cache(redis_client=None) -> CacheLayer:
    """Create an isolated cache layer for deterministic tests."""
    layer = object.__new__(CacheLayer)
    layer.redis_url = "memory://test"
    layer._redis = redis_client
    layer._memory = InMemoryCache()
    return layer


FRANKFURTER_USD_INR_FIXTURE = {
    "amount": 1.0,
    "base": "USD",
    "date": "2026-11-10",
    "rates": {"INR": 93.93},
}

WORLDBANK_GDP_FIXTURE = [
    {"page": 1, "pages": 1, "per_page": 5, "total": 2, "lastupdated": "2026-10-08"},
    [
        {"date": "2025", "value": 7.566},
        {"date": "2024", "value": None},
        {"date": "2023", "value": 8.15},
    ],
]

MFAPI_LATEST_FIXTURE = {
    "meta": {
        "fund_house": "HDFC Mutual Fund",
        "scheme_type": "Open Ended Schemes",
        "scheme_category": "Equity Scheme - Large Cap Fund",
        "scheme_code": 119551,
        "scheme_name": "HDFC Top 100 Fund - Direct Plan - Growth",
    },
    "data": [{"date": "09-11-2026", "nav": "107.41350"}],
    "status": "SUCCESS",
}

AV_DAILY_FIXTURE = {
    "Meta Data": {"2. Symbol": "RELIANCE.BSE"},
    "Time Series (Daily)": {
        "2026-11-10": {
            "1. open": "1280.00",
            "2. high": "1305.00",
            "3. low": "1275.00",
            "4. close": "1298.50",
            "5. volume": "543210",
        }
    },
}

AV_DAILY_ADJUSTED_FIXTURE = {
    "Meta Data": {"2. Symbol": "RELIANCE.BSE"},
    "Time Series (Daily)": {
        "2026-11-10": {
            "1. open": "1280.00",
            "2. high": "1305.00",
            "3. low": "1275.00",
            "4. close": "1298.50",
            "5. adjusted close": "1291.25",
            "6. volume": "543210",
            "7. dividend amount": "7.25",
            "8. split coefficient": "1.0",
        }
    },
}

TD_SERIES_FIXTURE = {
    "meta": {"symbol": "RELIANCE:NSE", "exchange": "NSE", "currency": "INR", "interval": "1day"},
    "values": [
        {
            "datetime": "2026-11-10",
            "open": "1280.00",
            "high": "1305.00",
            "low": "1275.00",
            "close": "1298.50",
            "volume": "543210",
        }
    ],
    "status": "ok",
}


# ── 1. Capability Registry, Settings & Status Distinctions ───────────────────

class TestCapabilityRegistry:
    def test_all_six_providers_registered(self):
        reg = CapabilityRegistry(Settings(secret_key="x" * 32))
        ids = {p.provider_id for p in reg.list_all()}
        assert ids == {"frankfurter", "worldbank", "mfapi", "alpha_vantage", "twelve_data", "gnews"}

    def test_status_labels_distinguish_key_required_configured_unverified_and_healthy(self):
        cfg = Settings(
            secret_key="x" * 32,
            app_env="development",
            alpha_vantage_api_key="av_key_123",
            twelvedata_api_key=None,
            gnews_api_key=None,
        )
        reg = CapabilityRegistry(cfg)

        av = reg.get("alpha_vantage")
        td = reg.get("twelve_data")
        ff = reg.get("frankfurter")

        assert av.enabled is True
        assert av.status_label == "CONFIGURED"  # Not CONNECTED / HEALTHY before live call
        assert av.status_label != "CONNECTED"
        assert td.enabled is False and td.status_label == "KEY_REQUIRED"
        assert ff.enabled is True and ff.status_label == "UNVERIFIED"

    def test_unknown_app_env_never_enables_dev_only_or_free_td(self):
        for unknown_env in ("staging", "qa", "custom_env", ""):
            cfg = Settings(
                secret_key="x" * 32,
                app_env=unknown_env,
                gnews_dev_mode=True,
                gnews_api_key="dev_secret",
                twelvedata_api_key="td_secret",
                twelvedata_plan="free",
            )
            reg = CapabilityRegistry(cfg)
            assert reg.get("gnews").enabled is False
            assert reg.get("gnews").status_label == "UNAVAILABLE"
            assert reg.get("twelve_data").enabled is False

            gn = GNewsAdapter(cache=make_isolated_cache(), app_settings=cfg)
            resp = asyncio.run(gn.search_news("NIFTY"))
            assert resp.status == "unavailable"

    def test_adapters_fail_gracefully_without_keys(self):
        cfg = Settings(
            secret_key="x" * 32,
            alpha_vantage_api_key=None,
            twelvedata_api_key=None,
            gnews_api_key=None,
        )
        av_resp = asyncio.run(
            AlphaVantageAdapter(cache=make_isolated_cache(), app_settings=cfg).get_daily_eod("RELIANCE.BSE")
        )
        td_resp = asyncio.run(
            TwelveDataAdapter(cache=make_isolated_cache(), app_settings=cfg).get_quote("RELIANCE")
        )
        gn_resp = asyncio.run(
            GNewsAdapter(cache=make_isolated_cache(), app_settings=cfg).search_news("TCS")
        )

        for r in (av_resp, td_resp, gn_resp):
            assert r.status == "unavailable"
            assert r.freshness == "UNAVAILABLE"
            assert r.data is None


# ── 2 & 3. Quota Accounting, Retries, Retry-After & Redis Fallback ───────────

class TestQuotaAndErrorHandling:
    def test_alpha_vantage_http_200_note_and_info_map_to_quota_exhausted(self):
        cfg = Settings(secret_key="x" * 32, alpha_vantage_api_key="dummy_key")
        # Note (burst limit) should trigger cooldown, Information daily should trigger daily exhaustion
        adapter = AlphaVantageAdapter(cache=make_isolated_cache(), app_settings=cfg)
        with patch.object(
            adapter,
            "_make_request",
            new=AsyncMock(return_value={"Note": "API call frequency is 5 calls per minute."}),
        ):
            resp = asyncio.run(adapter.get_daily_eod("RELIANCE.BSE", skip_cache=True))
        assert resp.status == "quota_exhausted"
        assert adapter.quota_status()["rate_limited"] is True
        # Daily quota was NOT wiped out on per-minute Note
        assert adapter.quota_status()["quota_remaining"] == 25

        adapter2 = AlphaVantageAdapter(cache=make_isolated_cache(), app_settings=cfg)
        with patch.object(
            adapter2,
            "_make_request",
            new=AsyncMock(return_value={"Information": "Daily API rate limit reached (25 requests/day)."}),
        ):
            resp2 = asyncio.run(adapter2.get_daily_eod("RELIANCE.BSE", skip_cache=True))
        assert resp2.status == "quota_exhausted"
        assert adapter2.quota_status()["quota_remaining"] == 0

    def test_http_429_respects_retry_after_without_wiping_daily_quota(self):
        redis = FakeRedis()
        adapter = TwelveDataAdapter(
            cache=make_isolated_cache(redis),
            app_settings=Settings(
                secret_key="x" * 32,
                app_env="development",
                twelvedata_api_key="td_key",
                twelvedata_plan="grow",
            ),
        )
        req = httpx.Request("GET", "https://api.twelvedata.com/quote")
        res_429 = httpx.Response(429, headers={"Retry-After": "45"}, request=req)

        with patch("httpx.AsyncClient.get", new=AsyncMock(return_value=res_429)):
            resp = asyncio.run(adapter.get_quote("RELIANCE", exchange="NSE", skip_cache=True))

        assert resp.status == "quota_exhausted"
        assert "45s" in (resp.unavailable_reason or "")
        q = adapter.quota_status()
        assert q["rate_limited"] is True
        # Only 1 attempt was deducted; 799/800 daily credits remain intact!
        assert q["quota_remaining"] == 799
        assert adapter.last_health == "degraded"

    def test_retries_consume_quota_per_upstream_attempt_across_workers(self):
        redis = FakeRedis()
        cfg = Settings(
            secret_key="x" * 32,
            app_env="development",
            twelvedata_api_key="td_key",
            twelvedata_plan="grow",
        )
        worker1 = TwelveDataAdapter(cache=make_isolated_cache(redis), app_settings=cfg)
        worker2 = TwelveDataAdapter(cache=make_isolated_cache(redis), app_settings=cfg)

        req = httpx.Request("GET", "https://api.twelvedata.com/time_series")
        err_500 = httpx.Response(500, request=req)
        ok_200 = httpx.Response(200, json=TD_SERIES_FIXTURE, request=req)

        with patch("httpx.AsyncClient.get", new=AsyncMock(side_effect=[err_500, ok_200])):
            resp = asyncio.run(worker1.get_time_series("RELIANCE", exchange="NSE", skip_cache=True))

        assert resp.status == "ok"
        # Shared Redis reflects both upstream attempts (initial 500 + retry 200 = 2 credits)
        assert worker2.quota_status()["quota_used_today"] == 2
        assert worker2.quota_status()["quota_scope"] == "redis_shared"

    def test_redis_unavailable_falls_back_safely_to_local_quota(self):
        broken_redis = FakeRedis()
        broken_redis.eval = MagicMockRaise()
        broken_redis.get = MagicMockRaise()
        broken_redis.incrby = MagicMockRaise()

        adapter = AlphaVantageAdapter(
            cache=make_isolated_cache(broken_redis),
            app_settings=Settings(secret_key="x" * 32, alpha_vantage_api_key="av_key"),
        )
        ok, _, _ = asyncio.run(adapter.check_and_consume_quota(credit_weight=1))
        assert ok is True
        status = adapter.quota_status()
        assert status["quota_scope"] == "process_local_fallback"
        assert status["quota_used_today"] == 1

    def test_malformed_payloads_never_raise_unhandled_exceptions(self):
        ff = FrankfurterAdapter(cache=make_isolated_cache())
        with patch.object(ff, "_make_request", new=AsyncMock(return_value="not-json-dict")):
            r = asyncio.run(ff.get_rate("USD", "INR", skip_cache=True))
        assert r.status == "unavailable"

        wb = WorldBankAdapter(cache=make_isolated_cache())
        with patch.object(wb, "_make_request", new=AsyncMock(return_value=[{"message": [{"value": "Bad"}]}])):
            r2 = asyncio.run(wb.get_indicator("NY.GDP.MKTP.KD.ZG", skip_cache=True))
        assert r2.status == "error"

        mf = MFAPIAdapter(cache=make_isolated_cache())
        with patch.object(mf, "_make_request", new=AsyncMock(return_value={"meta": None, "data": ["bad"]})):
            r3 = asyncio.run(mf.get_latest_nav(119551, skip_cache=True))
        assert r3.status == "unavailable"


class MagicMockRaise:
    def __call__(self, *args, **kwargs):
        raise ConnectionError("Redis connection refused")


# ── 4. Exchange Integrity & Adjusted vs Unadjusted Series ────────────────────

class TestNSEExchangeAndAdjustedGating:
    def test_alpha_vantage_rejects_nse_and_free_adjusted_never_falls_back_to_eod(self):
        cfg_free = Settings(secret_key="x" * 32, alpha_vantage_api_key="k", alpha_vantage_plan="free")
        adapter_free = AlphaVantageAdapter(cache=make_isolated_cache(), app_settings=cfg_free)

        nse_resp = asyncio.run(adapter_free.get_daily_eod("RELIANCE.NS", exchange="NSE"))
        assert nse_resp.status == "unavailable"
        assert "NSE" in (nse_resp.unavailable_reason or "")

        adj_free = asyncio.run(adapter_free.get_daily_adjusted("RELIANCE.BSE", exchange="BSE"))
        assert adj_free.status == "unavailable"
        assert "premium" in (adj_free.unavailable_reason or "").lower()

    def test_alpha_vantage_premium_adjusted_parses_real_fields_never_unadjusted(self):
        cfg_prem = Settings(secret_key="x" * 32, alpha_vantage_api_key="k", alpha_vantage_plan="premium")
        adapter = AlphaVantageAdapter(cache=make_isolated_cache(), app_settings=cfg_prem)

        with patch.object(adapter, "_make_request", new=AsyncMock(return_value=AV_DAILY_ADJUSTED_FIXTURE)):
            resp = asyncio.run(adapter.get_daily_adjusted("RELIANCE", exchange="BSE", skip_cache=True))
        assert resp.status == "ok"
        assert resp.data["adjustment_basis"] == "adjusted"
        assert resp.data["candles"][0]["adjusted_close"] == 1291.25
        assert resp.data["candles"][0]["dividend_amount"] == 7.25

        # Unadjusted upstream payload missing '5. adjusted close' MUST fail closed
        with patch.object(adapter, "_make_request", new=AsyncMock(return_value=AV_DAILY_FIXTURE)):
            bad_adj = asyncio.run(adapter.get_daily_adjusted("RELIANCE", exchange="BSE", skip_cache=True))
        assert bad_adj.status == "unavailable"

    def test_twelve_data_rejects_exchange_mismatch_and_interval_mismatch(self):
        cfg = Settings(
            secret_key="x" * 32,
            app_env="development",
            twelvedata_api_key="k",
            twelvedata_plan="grow",
        )
        adapter = TwelveDataAdapter(cache=make_isolated_cache(), app_settings=cfg)

        # Symbol explicitly tagged .NS cannot be queried as BSE
        r_conflict = asyncio.run(adapter.get_time_series("RELIANCE.NS", exchange="BSE"))
        assert r_conflict.status == "unavailable"

        # Upstream silently returning BSE when NSE was requested fails closed
        wrong_ex_payload = {
            **TD_SERIES_FIXTURE,
            "meta": {"symbol": "RELIANCE", "exchange": "BSE", "currency": "INR", "interval": "1day"},
        }
        with patch.object(adapter, "_make_request", new=AsyncMock(return_value=wrong_ex_payload)):
            r_mismatch = asyncio.run(adapter.get_time_series("RELIANCE", exchange="NSE", skip_cache=True))
        assert r_mismatch.status == "unavailable"
        assert "Exchange mismatch" in (r_mismatch.unavailable_reason or "")


# ── 5 & 6. Guardrails, Coalescing Bounds & Concurrency ───────────────────────

class TestGuardrailsAndCoalescing:
    def test_currency_and_unit_validation_and_timestamps(self):
        ok, _ = validate_currency_and_unit("INR", "USD")
        assert ok is False
        ok_ts, _ = validate_observation_timestamp(None)
        assert ok_ts is False
        old_dt = (datetime.now(timezone.utc) - timedelta(days=5)).isoformat()
        ok_stale, _ = validate_observation_timestamp(old_dt, max_age_seconds=3600)
        assert ok_stale is False
        assert enforce_non_live_freshness("LIVE", "alpha_vantage") == "DELAYED"

        primary = {
            "instrument": "RELIANCE",
            "exchange": "NSE",
            "currency": "INR",
            "data_type": "ohlcv",
            "adjustment_basis": "adjusted",
            "entitlement": "kite_live",
            "require_realtime": True,
        }
        cand = {**primary, "adjustment_basis": "unadjusted", "freshness": "END_OF_DAY"}
        ok_fb, _ = can_fallback_market_series(primary, cand)
        assert ok_fb is False

    def test_concurrent_async_coalescing_and_bounded_lock_storage(self):
        adapter = FrankfurterAdapter(cache=make_isolated_cache())
        upstream_calls = 0

        async def slow_req(url, params=None, credit_weight=1):
            nonlocal upstream_calls
            await asyncio.sleep(0.08)
            upstream_calls += 1
            return FRANKFURTER_USD_INR_FIXTURE

        async def run_concurrent():
            with patch.object(adapter, "_make_request", side_effect=slow_req):
                results = await asyncio.gather(*(adapter.get_rate("USD", "INR") for _ in range(6)))
            assert upstream_calls == 1
            assert all(r.status == "ok" and r.data["rate"] == 93.93 for r in results)

            # Verify lock dictionary stays strictly bounded
            for i in range(MAX_COALESCE_LOCKS + 50):
                adapter._get_coalesce_lock(f"ext:frankfurter:key:{i}")
            assert len(adapter._coalesce_locks) <= MAX_COALESCE_LOCKS

        asyncio.run(run_concurrent())


# ── 7. Auth, Rate Limits & Non-Blocking FastAPI Router ───────────────────────

class TestAuthAndNonBlockingRoutes:
    def test_data_sources_routes_require_jwt_auth(self):
        client = TestClient(app)
        unauth_status = client.get("/api/data-sources/status")
        assert unauth_status.status_code in (401, 403)
        unauth_fx = client.get("/api/data-sources/fx/usd-inr")
        assert unauth_fx.status_code in (401, 403)

        token = create_access_token("42")
        headers = {"Authorization": f"Bearer {token}"}
        ok_status = client.get("/api/data-sources/status", headers=headers)
        assert ok_status.status_code == 200
        assert len(ok_status.json()["providers"]) == 6

    def test_caller_rate_limit_enforced_with_429(self, monkeypatch):
        client = TestClient(app)
        token = create_access_token("rate_limit_user_99")
        headers = {"Authorization": f"Bearer {token}"}

        from api import data_sources as ds_mod
        monkeypatch.setattr(
            ds_mod,
            "get_settings",
            lambda reload=False: Settings(secret_key="x" * 32, research_rate_limit_per_minute=2),
        )
        ds_mod._LOCAL_USER_LIMITS.clear()

        with patch(
            "api.data_sources.frankfurter.get_usd_inr_rate",
            new=AsyncMock(
                return_value=ProviderResponse(
                    provider_id="frankfurter",
                    data={"rate": 93.93},
                    observation_time="2026-11-10",
                    freshness="REFERENCE_RATE",
                    status="ok",
                )
            ),
        ):
            r1 = client.get("/api/data-sources/fx/usd-inr", headers=headers)
            r2 = client.get("/api/data-sources/fx/usd-inr", headers=headers)
            r3 = client.get("/api/data-sources/fx/usd-inr", headers=headers)

        assert r1.status_code == 200
        assert r2.status_code == 200
        assert r3.status_code == 429
        assert "Retry-After" in r3.headers

    def test_slow_research_provider_does_not_block_health_endpoint(self):
        token = create_access_token("nonblock_user_7")
        headers = {"Authorization": f"Bearer {token}"}

        async def slow_fx():
            await asyncio.sleep(0.35)
            return ProviderResponse(
                provider_id="frankfurter",
                data={"rate": 93.93},
                observation_time="2026-11-10",
                freshness="REFERENCE_RATE",
                status="ok",
            )

        async def check_non_blocking():
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                with patch("api.data_sources.frankfurter.get_usd_inr_rate", side_effect=slow_fx):
                    slow_task = asyncio.create_task(client.get("/api/data-sources/fx/usd-inr", headers=headers))
                    await asyncio.sleep(0.03)
                    t0 = time.monotonic()
                    health_res = await client.get("/health")
                    elapsed = time.monotonic() - t0
                    fx_res = await slow_task

            assert health_res.status_code == 200
            assert elapsed < 0.15, f"/health was blocked for {elapsed:.3f}s by slow research call"
            assert fx_res.status_code == 200

        asyncio.run(check_non_blocking())

    def test_secret_redaction_in_responses_and_errors(self):
        gn_secret = "GNEWS_SUPER_SECRET_TOKEN_43210"
        cfg = Settings(
            secret_key="x" * 32,
            app_env="development",
            gnews_dev_mode=True,
            gnews_api_key=gn_secret,
        )
        req = httpx.Request("GET", f"https://gnews.io/api/v4/search?apikey={gn_secret}")
        err_resp = httpx.Response(500, request=req)
        gn = GNewsAdapter(cache=make_isolated_cache(), app_settings=cfg)
        with patch("httpx.AsyncClient.get", new=AsyncMock(return_value=err_resp)), patch(
            "asyncio.sleep", new=AsyncMock()
        ):
            gn_err = asyncio.run(gn.search_news("NIFTY"))
        assert gn_secret not in json.dumps(gn_err.to_dict())
