"""
Deterministic Fixture & Security Tests for External Research Data Providers.

Note: All tests in this module use deterministic fixtures and mock caches (zero live
network calls) so CI runs reproducibly without consuming upstream quotas or failing
when optional API keys are absent.

Covers Section 6 requirements:
1. Missing credentials
2. Quota exhaustion and HTTP 429
3. Provider errors returned inside HTTP 200 JSON
4. Unsupported NSE symbols & paid-endpoint gating
5. Currency and unit mismatches
6. Old or missing timestamps (no now() substitution)
7. Cache expiry and concurrent request deduplication (request coalescing)
8. Prevention of delayed-data promotion to LIVE
9. Production exclusion of development-only providers
10. Zero secret leakage in responses, URLs, and error strings
"""

import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient

from main import app
from services.external_providers.alpha_vantage_adapter import AlphaVantageAdapter
from services.external_providers.base import ProviderResponse, QuotaExhaustedError
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


def make_isolated_cache() -> CacheLayer:
    """Create an isolated in-memory cache layer for deterministic tests."""
    layer = object.__new__(CacheLayer)
    layer.redis_url = "memory://test"
    layer._redis = None
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

GNEWS_FIXTURE = {
    "totalArticles": 1,
    "articles": [
        {
            "title": "Nifty consolidates ahead of CPI data",
            "description": "Domestic benchmarks traded steady.",
            "url": "https://example.com/nifty-cpi",
            "publishedAt": "2026-11-10T04:15:00Z",
            "source": {"name": "Business Standard", "url": "https://business-standard.com"},
        }
    ],
}


# ── 1. Capability Registry & Missing Credentials ─────────────────────────────

class TestCapabilityRegistry:
    def test_all_six_providers_registered(self):
        reg = CapabilityRegistry()
        ids = {p.provider_id for p in reg.list_all()}
        assert ids == {"frankfurter", "worldbank", "mfapi", "alpha_vantage", "twelve_data", "gnews"}

    def test_missing_credentials_disables_keyed_providers(self, monkeypatch):
        monkeypatch.delenv("ALPHA_VANTAGE_API_KEY", raising=False)
        monkeypatch.delenv("TWELVEDATA_API_KEY", raising=False)
        monkeypatch.delenv("GNEWS_API_KEY", raising=False)
        reg = CapabilityRegistry()

        av = reg.get("alpha_vantage")
        td = reg.get("twelve_data")
        assert av.enabled is False and av.status_label == "KEY_REQUIRED"
        assert td.enabled is False and td.status_label == "KEY_REQUIRED"

    def test_adapters_fail_gracefully_without_keys(self, monkeypatch):
        monkeypatch.delenv("ALPHA_VANTAGE_API_KEY", raising=False)
        monkeypatch.delenv("TWELVEDATA_API_KEY", raising=False)
        monkeypatch.delenv("GNEWS_API_KEY", raising=False)

        av_resp = AlphaVantageAdapter(cache=make_isolated_cache()).get_daily_eod("RELIANCE.BSE")
        td_resp = TwelveDataAdapter(cache=make_isolated_cache()).get_quote("RELIANCE")
        gn_resp = GNewsAdapter(cache=make_isolated_cache()).search_news("TCS")

        for r in (av_resp, td_resp, gn_resp):
            assert r.status == "unavailable"
            assert r.freshness == "UNAVAILABLE"
            assert r.data is None


# ── 2 & 3. Quota Exhaustion, HTTP 429 & HTTP 200 Error Bodies ────────────────

class TestQuotaAndErrorHandling:
    def test_alpha_vantage_http_200_note_and_info_map_to_quota_exhausted(self, monkeypatch):
        monkeypatch.setenv("ALPHA_VANTAGE_API_KEY", "dummy_key")
        for body in (
            {"Note": "Thank you for using Alpha Vantage! API frequency limit reached."},
            {"Information": "Daily API rate limit reached (25 requests/day)."},
        ):
            adapter = AlphaVantageAdapter(cache=make_isolated_cache())
            with patch.object(adapter, "_make_request", return_value=body):
                resp = adapter.get_daily_eod("RELIANCE.BSE", skip_cache=True)
            assert resp.status == "quota_exhausted"
            assert resp.freshness == "UNAVAILABLE"

    def test_twelve_data_http_200_429_and_error_handling(self, monkeypatch):
        monkeypatch.setenv("TWELVEDATA_API_KEY", "dummy_key")
        monkeypatch.setenv("TWELVEDATA_PLAN", "grow")
        monkeypatch.setenv("APP_ENV", "development")

        adapter = TwelveDataAdapter(cache=make_isolated_cache())
        with patch.object(
            adapter, "_make_request",
            return_value={"status": "error", "code": 429, "message": "Credits exhausted"},
        ):
            resp = adapter.get_time_series("RELIANCE", skip_cache=True)
        assert resp.status == "quota_exhausted"

        with patch.object(
            adapter, "_make_request",
            return_value={"status": "error", "code": 404, "message": "Symbol not found"},
        ):
            resp_err = adapter.get_time_series("INVALIDXYZ", skip_cache=True)
        assert resp_err.status == "error"
        assert resp_err.data is None

    def test_upstream_http_429_exhausts_quota(self):
        adapter = FrankfurterAdapter(cache=make_isolated_cache())
        req = httpx.Request("GET", "https://api.frankfurter.dev/v1/latest")
        res_429 = httpx.Response(429, request=req)

        with patch("httpx.Client.get", return_value=res_429):
            resp = adapter.get_rate("USD", "INR", skip_cache=True)
        assert resp.status == "quota_exhausted"
        assert adapter.last_health == "quota_exhausted"

    def test_local_credit_weight_quota_blocks_after_cap(self):
        adapter = TwelveDataAdapter(cache=make_isolated_cache())
        adapter._quota_per_day = 5
        assert adapter.check_and_consume_quota(credit_weight=3) is True
        assert adapter.check_and_consume_quota(credit_weight=2) is True
        # 6th credit exceeds daily limit of 5
        assert adapter.check_and_consume_quota(credit_weight=1) is False
        assert adapter.quota_status()["quota_remaining"] == 0

    def test_worldbank_and_mfapi_http_200_errors(self):
        wb = WorldBankAdapter(cache=make_isolated_cache())
        with patch.object(wb, "_make_request", return_value=[{"message": [{"id": "120", "value": "Invalid"}]}]):
            resp = wb.get_indicator("NY.GDP.MKTP.KD.ZG", skip_cache=True)
        assert resp.status == "error"

        mf = MFAPIAdapter(cache=make_isolated_cache())
        with patch.object(mf, "_make_request", return_value={"status": "ERROR", "message": "Invalid scheme"}):
            mf_resp = mf.get_latest_nav(9999999, skip_cache=True)
        assert mf_resp.status == "unavailable"


# ── 4. Unsupported NSE Symbols & Paid Endpoint Gating ────────────────────────

class TestNSEAndPlanGating:
    def test_alpha_vantage_rejects_nse_and_paid_adjusted_on_free_plan(self, monkeypatch):
        monkeypatch.setenv("ALPHA_VANTAGE_API_KEY", "test_key")
        monkeypatch.setenv("ALPHA_VANTAGE_PLAN", "free")
        adapter = AlphaVantageAdapter(cache=make_isolated_cache())

        nse_resp = adapter.get_daily_eod("RELIANCE.NS", exchange="NSE")
        assert nse_resp.status == "unavailable"
        assert "NSE" in (nse_resp.unavailable_reason or "")

        adj_resp = adapter.get_daily_adjusted("RELIANCE.BSE")
        assert adj_resp.status == "unavailable"
        assert "paid/premium" in (adj_resp.unavailable_reason or "")

    def test_twelve_data_blocks_nse_on_free_plan(self, monkeypatch):
        monkeypatch.setenv("TWELVEDATA_API_KEY", "test_key")
        monkeypatch.setenv("TWELVEDATA_PLAN", "free")
        adapter = TwelveDataAdapter(cache=make_isolated_cache())

        resp = adapter.get_time_series("RELIANCE:NSE")
        assert resp.status == "unavailable"
        assert "Grow/Pro/Ultra" in (resp.unavailable_reason or "")


# ── 5 & 6. Currency/Unit Mismatches & Old/Missing Timestamps ─────────────────

class TestGuardrailsCurrencyAndTimestamps:
    def test_currency_and_unit_mismatch_rejected(self):
        ok, err = validate_currency_and_unit("INR", "USD")
        assert ok is False and "Currency mismatch" in err

        ok2, err2 = validate_currency_and_unit("USD", "USD", "Constant 2015 USD", "Annual %")
        assert ok2 is False and "Unit mismatch" in err2

        ok3, err3 = validate_currency_and_unit("INR", "INR", "NAV per unit (INR)", "NAV per unit (INR)")
        assert ok3 is True and err3 is None

    def test_fallback_compatibility_rejects_mismatched_basis(self):
        primary = {
            "instrument": "RELIANCE",
            "exchange": "NSE",
            "currency": "INR",
            "data_type": "ohlcv",
            "adjustment_basis": "adjusted",
            "entitlement": "kite_live",
            "require_realtime": True,
        }
        candidate = {**primary, "adjustment_basis": "unadjusted", "freshness": "END_OF_DAY"}
        ok, reason = can_fallback_market_series(primary, candidate)
        assert ok is False
        assert "adjustment basis" in reason

    def test_missing_or_stale_timestamp_rejected_without_now_fallback(self):
        ok_none, _ = validate_observation_timestamp(None)
        assert ok_none is False

        old_dt = (datetime.now(timezone.utc) - timedelta(days=5)).isoformat()
        ok_stale, msg = validate_observation_timestamp(old_dt, max_age_seconds=3600)
        assert ok_stale is False and "stale" in msg

    def test_adapters_keep_missing_timestamp_unavailable_never_now(self):
        ff = FrankfurterAdapter(cache=make_isolated_cache())
        with patch.object(ff, "_make_request", return_value={"base": "USD", "rates": {"INR": 93.9}}):
            resp = ff.get_rate("USD", "INR")
        assert resp.status == "unavailable"
        assert resp.observation_time is None

        mf = MFAPIAdapter(cache=make_isolated_cache())
        with patch.object(
            mf, "_make_request",
            return_value={"meta": {"scheme_name": "X"}, "data": [{"date": "not-a-date", "nav": "10"}]},
        ):
            mf_resp = mf.get_latest_nav(119551)
        assert mf_resp.status == "unavailable"
        assert mf_resp.observation_time is None


# ── 7. Cache Expiry & Concurrent Request Coalescing ──────────────────────────

class TestCachingAndCoalescing:
    def test_cache_hit_and_expiry(self):
        cache = make_isolated_cache()
        adapter = FrankfurterAdapter(cache=cache)
        adapter.cache_ttl_seconds = 1

        call_count = 0

        def fake_req(url, params=None, credit_weight=1):
            nonlocal call_count
            call_count += 1
            return FRANKFURTER_USD_INR_FIXTURE

        with patch.object(adapter, "_make_request", side_effect=fake_req):
            r1 = adapter.get_rate("USD", "INR")
            r2 = adapter.get_rate("USD", "INR")
            assert r1.cached is False
            assert r2.cached is True
            assert call_count == 1

            # Wait past 1s TTL -> cache expires -> fresh upstream request runs
            time.sleep(1.1)
            r3 = adapter.get_rate("USD", "INR")
            assert r3.cached is False
            assert call_count == 2

    def test_concurrent_requests_coalesced_to_single_upstream_call(self):
        cache = make_isolated_cache()
        adapter = FrankfurterAdapter(cache=cache)
        upstream_calls = 0
        count_lock = threading.Lock()

        def slow_upstream(url, params=None, credit_weight=1):
            nonlocal upstream_calls
            time.sleep(0.15)
            with count_lock:
                upstream_calls += 1
            return FRANKFURTER_USD_INR_FIXTURE

        with patch.object(adapter, "_make_request", side_effect=slow_upstream):
            with ThreadPoolExecutor(max_workers=6) as pool:
                results = list(pool.map(lambda _: adapter.get_rate("USD", "INR"), range(6)))

        assert upstream_calls == 1, f"Expected 1 coalesced upstream call, got {upstream_calls}"
        assert all(r.status == "ok" and r.data["rate"] == 93.93 for r in results)

    def test_cache_bypassed_when_caching_not_permitted(self):
        cache = make_isolated_cache()
        adapter = FrankfurterAdapter(cache=cache)
        adapter.caching_permitted = False

        calls = 0

        def fake_req(url, params=None, credit_weight=1):
            nonlocal calls
            calls += 1
            return FRANKFURTER_USD_INR_FIXTURE

        with patch.object(adapter, "_make_request", side_effect=fake_req):
            adapter.get_rate("USD", "INR")
            adapter.get_rate("USD", "INR")
        assert calls == 2


# ── 8 & 9. No LIVE Promotion & Production Dev-Only Exclusion ─────────────────

class TestFreshnessAndProductionExclusion:
    def test_provider_response_never_allows_live_freshness(self):
        resp = ProviderResponse(provider_id="twelve_data", data={"price": 100}, freshness="LIVE")
        assert resp.freshness == "UNAVAILABLE"
        assert enforce_non_live_freshness("LIVE", "alpha_vantage") == "DELAYED"

    def test_gnews_excluded_in_production_even_when_dev_flag_and_key_set(self, monkeypatch):
        monkeypatch.setenv("APP_ENV", "production")
        monkeypatch.setenv("GNEWS_DEV_MODE", "true")
        monkeypatch.setenv("GNEWS_API_KEY", "dev_secret_key")

        reg = CapabilityRegistry()
        assert reg.get("gnews").enabled is False

        adapter = GNewsAdapter(cache=make_isolated_cache())
        resp = adapter.search_news("RELIANCE")
        assert resp.status == "unavailable"
        assert "prohibit production" in (resp.unavailable_reason or "")

    def test_twelve_data_free_tier_excluded_in_production(self, monkeypatch):
        monkeypatch.setenv("APP_ENV", "production")
        monkeypatch.setenv("TWELVEDATA_API_KEY", "td_key")
        monkeypatch.setenv("TWELVEDATA_PLAN", "free")

        reg = CapabilityRegistry()
        assert reg.get("twelve_data").enabled is False

        adapter = TwelveDataAdapter(cache=make_isolated_cache())
        resp = adapter.get_time_series("AAPL")
        assert resp.status == "unavailable"
        assert "prohibit production" in (resp.unavailable_reason or "")


# ── 10. Secret Leakage & Router Integration ──────────────────────────────────

class TestSecretRedactionAndRoutes:
    def test_api_keys_never_appear_in_responses_or_errors(self, monkeypatch):
        av_secret = "AV_SUPER_SECRET_TOKEN_98765"
        gn_secret = "GNEWS_SUPER_SECRET_TOKEN_43210"
        monkeypatch.setenv("ALPHA_VANTAGE_API_KEY", av_secret)
        monkeypatch.setenv("GNEWS_API_KEY", gn_secret)
        monkeypatch.setenv("GNEWS_DEV_MODE", "true")
        monkeypatch.setenv("APP_ENV", "development")

        av = AlphaVantageAdapter(cache=make_isolated_cache())
        with patch.object(av, "_make_request", return_value=AV_DAILY_FIXTURE):
            av_ok = av.get_daily_eod("RELIANCE.BSE")
        assert av_secret not in json.dumps(av_ok.to_dict())

        # Also test HTTP error path redacts key from URL error message
        req = httpx.Request("GET", f"https://gnews.io/api/v4/search?apikey={gn_secret}")
        err_resp = httpx.Response(500, request=req)
        gn = GNewsAdapter(cache=make_isolated_cache())
        with patch("httpx.Client.get", return_value=err_resp), patch("time.sleep"):
            gn_err = gn.search_news("NIFTY")
        assert gn_secret not in json.dumps(gn_err.to_dict())

    def test_fastapi_data_sources_routes_with_fixtures(self):
        client = TestClient(app)
        status_res = client.get("/api/data-sources/status")
        assert status_res.status_code == 200
        assert len(status_res.json()["providers"]) == 6

        with patch(
            "api.data_sources.frankfurter.get_usd_inr_rate",
            return_value=ProviderResponse(
                provider_id="frankfurter",
                data={"rate": 93.93, "effective_date": "2026-11-10"},
                observation_time="2026-11-10",
                freshness="REFERENCE_RATE",
                status="ok",
            ),
        ):
            fx_res = client.get("/api/data-sources/fx/usd-inr")
        assert fx_res.status_code == 200
        assert fx_res.json()["freshness"] == "REFERENCE_RATE"
        assert fx_res.json()["observation_time"] == "2026-11-10"

