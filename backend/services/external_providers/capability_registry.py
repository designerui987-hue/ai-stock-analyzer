"""
External Data Provider Capability Registry.

Central typed registry tracking every supplemental API discovered from public-apis:
- enabled state and exact disabled/unavailable reason
- supported capabilities vs disabled endpoints/features
- market coverage, entitlement tier, plan gating
- quota limits, remaining quota (estimated), reset time
- live adapter health and last successful refresh
- data frequency and freshness policy (never promoted to LIVE)
"""

import os
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class ProviderInfo:
    provider_id: str
    display_name: str
    description: str
    base_url: str
    capabilities: List[str]
    disabled_features: Dict[str, str]
    market_coverage: List[str]
    entitlement: str  # "free_no_key" | "free_key_required" | "paid_required"
    key_env_var: Optional[str]
    dev_only: bool
    quota_per_day: Optional[int]
    quota_per_minute: Optional[int]
    credit_weight: int
    cache_ttl_seconds: int
    caching_permitted: bool
    redistribution_permitted: bool
    data_frequency: str
    freshness_policy: str  # REFERENCE_RATE | END_OF_DAY | NAV | DELAYED | UNAVAILABLE
    terms_url: str
    docs_url: str
    enabled: bool = False
    status_label: str = "UNAVAILABLE"  # CONNECTED | KEY_REQUIRED | QUOTA_EXHAUSTED | UNAVAILABLE | DEV_ONLY
    health: str = "unknown"
    unavailable_reason: Optional[str] = None
    last_refresh: Optional[str] = None
    quota_remaining: Optional[int] = None
    quota_is_estimated: bool = False
    reset_time: Optional[str] = None
    verification_status: str = "not_tested"


class CapabilityRegistry:
    """Evaluates provider entitlement, env keys, plan limits, and runtime health."""

    def __init__(self):
        self._providers: Dict[str, ProviderInfo] = {}
        self._build_registry()

    @staticmethod
    def _app_env() -> str:
        return (os.environ.get("APP_ENV") or "development").strip().lower()

    @staticmethod
    def _is_production() -> bool:
        return CapabilityRegistry._app_env() == "production"

    def _register(self, info: ProviderInfo) -> None:
        is_prod = self._is_production()
        if info.dev_only and (is_prod or os.environ.get("GNEWS_DEV_MODE", "false").lower() != "true"):
            info.enabled = False
            info.status_label = "DEV_ONLY" if not is_prod else "UNAVAILABLE"
            info.health = "disabled"
            info.unavailable_reason = (
                f"{info.display_name} free plan terms prohibit production use. "
                "Requires non-production APP_ENV and GNEWS_DEV_MODE=true."
            )
        elif info.entitlement == "free_key_required":
            key_present = bool(info.key_env_var and os.environ.get(info.key_env_var))
            if not key_present:
                info.enabled = False
                info.status_label = "KEY_REQUIRED"
                info.health = "key_required"
                info.unavailable_reason = (
                    f"API key not configured. Set server-side {info.key_env_var}."
                )
            elif info.provider_id == "twelve_data" and is_prod and (
                os.environ.get("TWELVEDATA_PLAN", "free").lower() == "free"
            ):
                info.enabled = False
                info.status_label = "UNAVAILABLE"
                info.health = "disabled"
                info.unavailable_reason = (
                    "Twelve Data free Basic plan terms prohibit production deployment and NSE access."
                )
            else:
                info.enabled = True
                info.status_label = "CONNECTED"
                info.health = "healthy"
        elif info.entitlement == "free_no_key":
            info.enabled = True
            info.status_label = "CONNECTED"
            info.health = "healthy"
        else:
            info.enabled = False
            info.status_label = "UNAVAILABLE"
            info.health = "disabled"
            info.unavailable_reason = "Paid subscription required."

        self._providers[info.provider_id] = info

    def _build_registry(self) -> None:
        av_plan = (os.environ.get("ALPHA_VANTAGE_PLAN") or "free").strip().lower()
        td_plan = (os.environ.get("TWELVEDATA_PLAN") or "free").strip().lower()

        self._register(ProviderInfo(
            provider_id="frankfurter",
            display_name="Frankfurter",
            description=(
                "European Central Bank (ECB) reference exchange rates for INR/USD/EUR/GBP/JPY "
                "and historical series. Reference benchmark only — NOT executable FX prices."
            ),
            base_url="https://api.frankfurter.dev/v1",
            capabilities=["fx_reference_rates", "usd_inr_rate", "fx_history"],
            disabled_features={
                "executable_fx_quotes": "Publishes daily ECB reference rates only (~16:00 CET), not live bid/ask quotes.",
            },
            market_coverage=["FX Reference Rates (ECB currencies including INR)"],
            entitlement="free_no_key",
            key_env_var=None,
            dev_only=False,
            quota_per_day=None,
            quota_per_minute=None,
            credit_weight=1,
            cache_ttl_seconds=3600,
            caching_permitted=True,
            redistribution_permitted=False,
            data_frequency="Daily (~16:00 CET)",
            freshness_policy="REFERENCE_RATE",
            terms_url="https://frankfurter.dev/terms/",
            docs_url="https://frankfurter.dev/docs/",
            verification_status="verified_live_request",
        ))

        self._register(ProviderInfo(
            provider_id="worldbank",
            display_name="World Bank Open Data",
            description=(
                "India macroeconomic indicators (GDP growth, CPI inflation, unemployment, "
                "current account, debt). Annual/revised series — NOT intraday data."
            ),
            base_url="https://api.worldbank.org/v2",
            capabilities=[
                "india_gdp_growth",
                "india_cpi_inflation",
                "india_unemployment",
                "india_macro_summary",
            ],
            disabled_features={
                "intraday_macro": "World Bank Indicators v2 provides annual/revised economic releases, not intraday signals.",
            },
            market_coverage=["India Macro (CC BY 4.0)"],
            entitlement="free_no_key",
            key_env_var=None,
            dev_only=False,
            quota_per_day=None,
            quota_per_minute=None,
            credit_weight=1,
            cache_ttl_seconds=86400,
            caching_permitted=True,
            redistribution_permitted=True,
            data_frequency="Annual / Quarterly (Revised)",
            freshness_policy="END_OF_DAY",
            terms_url="https://datacatalog.worldbank.org/public-licenses#cc-by",
            docs_url="https://datahelpdesk.worldbank.org/knowledgebase/topics/125589",
            verification_status="verified_live_request",
        ))

        self._register(ProviderInfo(
            provider_id="mfapi",
            display_name="MFapi.in (AMFI Mutual Funds)",
            description=(
                "Optional Indian mutual fund research tab: AMFI scheme search and historical NAV "
                "with explicit NAV dates. Excluded from critical equity execution path."
            ),
            base_url="https://api.mfapi.in",
            capabilities=["mf_scheme_search", "mf_latest_nav", "mf_nav_history"],
            disabled_features={
                "intraday_nav": "Mutual fund NAVs update daily after market close; community wrapper, not official AMFI portal.",
            },
            market_coverage=["Indian Mutual Funds (AMFI)"],
            entitlement="free_no_key",
            key_env_var=None,
            dev_only=False,
            quota_per_day=None,
            quota_per_minute=None,
            credit_weight=1,
            cache_ttl_seconds=3600,
            caching_permitted=True,
            redistribution_permitted=False,
            data_frequency="Daily EOD (~21:00 IST)",
            freshness_policy="NAV",
            terms_url="https://www.mfapi.in/",
            docs_url="https://www.mfapi.in/",
            verification_status="verified_live_request",
        ))

        av_disabled = {
            "live_nse_quotes": "Alpha Vantage does not supply free live NSE quotes.",
            "nse_symbols": "NSE symbols (.NS) disabled on free tier due to unreliable upstream coverage; BSE EOD research only.",
        }
        if av_plan != "premium":
            av_disabled["TIME_SERIES_DAILY_ADJUSTED"] = "Premium endpoint on Alpha Vantage (returns quota/paywall notice on free keys)."

        self._register(ProviderInfo(
            provider_id="alpha_vantage",
            display_name="Alpha Vantage",
            description=(
                "Optional research provider (25 req/day, 5/min on free key). "
                "BSE unadjusted EOD and FX research only — does NOT supply free live NSE quotes."
            ),
            base_url="https://www.alphavantage.co/query",
            capabilities=["bse_daily_eod_unadjusted", "fx_exchange_rate"],
            disabled_features=av_disabled,
            market_coverage=["BSE (EOD unadjusted research)", "FX"],
            entitlement="free_key_required",
            key_env_var="ALPHA_VANTAGE_API_KEY",
            dev_only=False,
            quota_per_day=25,
            quota_per_minute=5,
            credit_weight=1,
            cache_ttl_seconds=3600,
            caching_permitted=True,
            redistribution_permitted=False,
            data_frequency="Daily EOD",
            freshness_policy="END_OF_DAY",
            terms_url="https://www.alphavantage.co/terms_of_service/",
            docs_url="https://www.alphavantage.co/documentation/",
            verification_status="docs_audited_fixture_tested",
        ))

        td_disabled = {
            "live_nse_quotes": "Free Basic plan does not cover live or NSE equity feeds (Grow/Pro/Ultra paid tier required).",
            "commercial_production": "Twelve Data Terms §2.3 restrict free Basic plan to internal evaluation/testing.",
        }
        if td_plan == "free":
            td_disabled["nse_time_series"] = "India NSE requires paid Grow/Pro/Ultra plan."

        self._register(ProviderInfo(
            provider_id="twelve_data",
            display_name="Twelve Data",
            description=(
                "Optional research provider (800 credits/day, 8/min on free Basic plan). "
                "NSE coverage requires paid Grow/Pro/Ultra plan and free Basic plan prohibits production distribution."
            ),
            base_url="https://api.twelvedata.com",
            capabilities=["paid_time_series", "paid_eod_quote"] if td_plan != "free" else [],
            disabled_features=td_disabled,
            market_coverage=["NSE/BSE (Paid Grow+ plans only; US/FX free eval)"],
            entitlement="free_key_required",
            key_env_var="TWELVEDATA_API_KEY",
            dev_only=False,
            quota_per_day=800,
            quota_per_minute=8,
            credit_weight=1,
            cache_ttl_seconds=3600,
            caching_permitted=True,
            redistribution_permitted=False,
            data_frequency="Daily EOD / Delayed (Paid NSE)",
            freshness_policy="END_OF_DAY",
            terms_url="https://twelvedata.com/terms",
            docs_url="https://twelvedata.com/docs",
            verification_status="docs_audited_fixture_tested",
        ))

        self._register(ProviderInfo(
            provider_id="gnews",
            display_name="GNews",
            description=(
                "Development-only India headline search (100 req/day, 12-hour article delay, 250-char snippet). "
                "Free plan strictly prohibits production/commercial use. Never used as entry trigger."
            ),
            base_url="https://gnews.io/api/v4",
            capabilities=["dev_news_search"],
            disabled_features={
                "production_news": "Free plan Terms of Service forbid production/commercial use.",
                "real_time_news_triggers": "12-hour free-tier delay; headlines never trigger trading entries.",
            },
            market_coverage=["India News (Dev Only, 12h Delayed)"],
            entitlement="free_key_required",
            key_env_var="GNEWS_API_KEY",
            dev_only=True,
            quota_per_day=100,
            quota_per_minute=None,
            credit_weight=1,
            cache_ttl_seconds=900,
            caching_permitted=True,
            redistribution_permitted=False,
            data_frequency="12h Delayed (Free Tier)",
            freshness_policy="DELAYED",
            terms_url="https://gnews.io/terms",
            docs_url="https://docs.gnews.io/",
            verification_status="docs_audited_fixture_tested",
        ))

    def _adapter_map(self) -> Dict[str, Any]:
        """Lazy-load runtime adapter singletons for live health, quota, and refresh timestamps."""
        from services.external_providers.alpha_vantage_adapter import alpha_vantage
        from services.external_providers.frankfurter_adapter import frankfurter
        from services.external_providers.gnews_adapter import gnews
        from services.external_providers.mfapi_adapter import mfapi
        from services.external_providers.twelve_data_adapter import twelve_data
        from services.external_providers.worldbank_adapter import worldbank

        return {
            "frankfurter": frankfurter,
            "worldbank": worldbank,
            "mfapi": mfapi,
            "alpha_vantage": alpha_vantage,
            "twelve_data": twelve_data,
            "gnews": gnews,
        }

    def get(self, provider_id: str) -> Optional[ProviderInfo]:
        return self._providers.get(provider_id)

    def list_all(self) -> List[ProviderInfo]:
        return list(self._providers.values())

    def is_enabled(self, provider_id: str) -> bool:
        info = self._providers.get(provider_id)
        return bool(info and info.enabled)

    def get_status(self) -> List[Dict[str, Any]]:
        """Serialize provider capabilities, live health, quota estimates, and disable reasons."""
        adapters = self._adapter_map()
        statuses: List[Dict[str, Any]] = []

        for pid, p in self._providers.items():
            adapter = adapters.get(pid)
            quota_info = adapter.quota_status() if adapter else {}
            last_refresh = adapter.last_refresh_at if adapter else p.last_refresh
            health = p.health
            status_label = p.status_label

            if p.enabled and adapter:
                if adapter.last_health == "quota_exhausted" or quota_info.get("quota_remaining") == 0:
                    health = "quota_exhausted"
                    status_label = "QUOTA_EXHAUSTED"
                elif adapter.last_health in ("healthy", "degraded"):
                    health = adapter.last_health

            statuses.append({
                "provider_id": p.provider_id,
                "display_name": p.display_name,
                "description": p.description,
                "enabled": p.enabled,
                "status_label": status_label,
                "health": health,
                "dev_only": p.dev_only,
                "entitlement": p.entitlement,
                "capabilities": p.capabilities,
                "disabled_features": p.disabled_features,
                "market_coverage": p.market_coverage,
                "freshness_policy": p.freshness_policy,
                "data_frequency": p.data_frequency,
                "quota_per_day": p.quota_per_day,
                "quota_per_minute": p.quota_per_minute,
                "credit_weight": p.credit_weight,
                "quota_remaining": quota_info.get("quota_remaining"),
                "quota_is_estimated": quota_info.get("quota_is_estimated", False),
                "reset_time": quota_info.get("reset_time"),
                "cache_ttl_seconds": p.cache_ttl_seconds,
                "caching_permitted": p.caching_permitted,
                "redistribution_permitted": p.redistribution_permitted,
                "unavailable_reason": p.unavailable_reason,
                "last_refresh": last_refresh,
                "terms_url": p.terms_url,
                "docs_url": p.docs_url,
                "verification_status": p.verification_status,
            })
        return statuses


registry = CapabilityRegistry()

