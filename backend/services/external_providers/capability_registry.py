"""
External Data Provider Capability Registry.

Central typed registry tracking every supplemental API discovered from public-apis:
- Configuration read strictly via central validated `Settings` (never `os.environ`)
- Enabled state and exact disabled/unavailable reason
- Distinct runtime states: CONFIGURED, UNVERIFIED, HEALTHY, DEGRADED, UNAVAILABLE
  (plus KEY_REQUIRED, QUOTA_EXHAUSTED, DEV_ONLY where disabled/exhausted; never CONNECTED)
- Actual `last_refresh` recorded only after a successful upstream request
"""

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from config import Settings, get_settings


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
    key_setting_attr: Optional[str]
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
    status_label: str = "UNAVAILABLE"  # CONFIGURED | UNVERIFIED | HEALTHY | DEGRADED | UNAVAILABLE | KEY_REQUIRED | QUOTA_EXHAUSTED | DEV_ONLY
    health: str = "unverified"
    unavailable_reason: Optional[str] = None
    last_refresh: Optional[str] = None
    quota_remaining: Optional[int] = None
    quota_is_estimated: bool = False
    reset_time: Optional[str] = None
    verification_status: str = "not_tested"


class CapabilityRegistry:
    """Evaluates provider entitlement, central Settings keys, plan limits, and runtime health."""

    def __init__(self, app_settings: Optional[Settings] = None):
        self._settings: Settings = app_settings or get_settings(reload=True)
        self._providers: Dict[str, ProviderInfo] = {}
        self._build_registry()

    def _register(self, info: ProviderInfo) -> None:
        is_explicit_dev = self._settings.is_explicit_development
        is_prod = self._settings.is_production
        td_plan = (self._settings.twelvedata_plan or "free").strip().lower()

        if info.dev_only and (not is_explicit_dev or not self._settings.gnews_dev_mode):
            info.enabled = False
            info.status_label = "DEV_ONLY" if (is_explicit_dev and not is_prod) else "UNAVAILABLE"
            info.health = "disabled"
            info.unavailable_reason = (
                f"{info.display_name} free plan terms prohibit production or non-development use. "
                "Requires explicit APP_ENV=development and GNEWS_DEV_MODE=true."
            )
        elif info.entitlement == "free_key_required":
            raw_key = getattr(self._settings, info.key_setting_attr, None) if info.key_setting_attr else None
            key_present = bool(raw_key and str(raw_key).strip())
            if not key_present:
                info.enabled = False
                info.status_label = "KEY_REQUIRED"
                info.health = "key_required"
                info.unavailable_reason = (
                    f"API key not configured. Set server-side {info.key_env_var}."
                )
            elif info.provider_id == "twelve_data" and td_plan == "free" and not is_explicit_dev:
                info.enabled = False
                info.status_label = "UNAVAILABLE"
                info.health = "disabled"
                info.unavailable_reason = (
                    "Twelve Data free Basic plan terms restrict use to explicit development evaluation "
                    "only and do not cover NSE."
                )
            else:
                info.enabled = True
                # Configured key != verified live connection until a request succeeds
                info.status_label = "CONFIGURED"
                info.health = "unverified"
        elif info.entitlement == "free_no_key":
            info.enabled = True
            info.status_label = "UNVERIFIED"
            info.health = "unverified"
        else:
            info.enabled = False
            info.status_label = "UNAVAILABLE"
            info.health = "disabled"
            info.unavailable_reason = "Paid subscription required."

        self._providers[info.provider_id] = info

    def _build_registry(self) -> None:
        av_plan = (self._settings.alpha_vantage_plan or "free").strip().lower()
        td_plan = (self._settings.twelvedata_plan or "free").strip().lower()

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
            key_setting_attr=None,
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
            verification_status="docs_and_fixture_verified",
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
            key_setting_attr=None,
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
            verification_status="docs_and_fixture_verified",
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
            key_setting_attr=None,
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
            verification_status="docs_and_fixture_verified",
        ))

        av_caps = ["bse_daily_eod_unadjusted", "fx_exchange_rate"]
        av_disabled = {
            "live_nse_quotes": "Alpha Vantage does not supply free live NSE quotes.",
            "nse_symbols": "NSE symbols (.NS) disabled on free tier due to unreliable upstream coverage; BSE EOD research only.",
        }
        if av_plan == "premium":
            av_caps.append("bse_daily_eod_adjusted")
        else:
            av_disabled["TIME_SERIES_DAILY_ADJUSTED"] = (
                "Premium endpoint on Alpha Vantage (returns paywall notice on free keys; requires ALPHA_VANTAGE_PLAN=premium)."
            )

        self._register(ProviderInfo(
            provider_id="alpha_vantage",
            display_name="Alpha Vantage",
            description=(
                "Optional research provider (25 req/day, 5/min on free key). "
                "BSE EOD and FX research only — does NOT supply free live NSE quotes."
            ),
            base_url="https://www.alphavantage.co/query",
            capabilities=av_caps,
            disabled_features=av_disabled,
            market_coverage=["BSE (EOD research only)", "FX"],
            entitlement="free_key_required",
            key_setting_attr="alpha_vantage_api_key",
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
            td_disabled["nse_time_series"] = "India NSE/BSE equity research requires paid Grow/Pro/Ultra plan."

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
            market_coverage=["NSE/BSE (Paid Grow+ plans only; US/FX dev eval)"],
            entitlement="free_key_required",
            key_setting_attr="twelvedata_api_key",
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
            key_setting_attr="gnews_api_key",
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
        """Serialize provider capabilities, live runtime health, quota state, and disable reasons."""
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
                elif quota_info.get("rate_limited") or adapter.last_health == "degraded":
                    health = "degraded"
                    status_label = "DEGRADED"
                elif adapter.last_health == "healthy" and last_refresh is not None:
                    health = "healthy"
                    status_label = "HEALTHY"
                else:
                    # Configured keyed provider vs unverified free provider prior to first real success
                    health = "unverified"
                    status_label = (
                        "CONFIGURED" if p.entitlement == "free_key_required" else "UNVERIFIED"
                    )

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
                "quota_used_today": quota_info.get("quota_used_today"),
                "quota_is_estimated": quota_info.get("quota_is_estimated", False),
                "rate_limited": quota_info.get("rate_limited", False),
                "quota_scope": quota_info.get("quota_scope"),
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
