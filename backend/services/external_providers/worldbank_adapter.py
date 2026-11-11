"""
World Bank Open Data Adapter — India Macroeconomic Indicators.

Official API: https://api.worldbank.org/v2
Authentication: None required.
License: Creative Commons Attribution 4.0 (CC BY 4.0) for World Bank datasets;
         third-party series may carry separate terms. Do not imply World Bank endorsement.
Caching: Explicitly recommended by World Bank (annual/revised economic indicators).
Freshness: Annual/quarterly statistics (labeled END_OF_DAY / Annual Macro).

IMPORTANT WORKFLOW BOUNDARY:
Economic statistics are annual/quarterly and subject to historical revisions.
NEVER interpret them as intraday trading signals.
"""

import logging
from typing import Any, Dict, List, Optional

from services.external_providers.base import (
    BaseAdapter,
    ProviderResponse,
    QuotaExhaustedError,
    make_unavailable,
)

logger = logging.getLogger("external_providers.worldbank")

PROVIDER_ID = "worldbank"
BASE_URL = "https://api.worldbank.org/v2"

INDIA_INDICATORS: Dict[str, Dict[str, str]] = {
    "NY.GDP.MKTP.KD.ZG": {
        "name": "GDP Growth Rate",
        "unit": "Annual %",
        "description": "Annual percentage growth rate of GDP at market prices based on constant local currency.",
    },
    "FP.CPI.TOTL.ZG": {
        "name": "Inflation (CPI)",
        "unit": "Annual %",
        "description": "Consumer price inflation measured by annual percentage change in CPI.",
    },
    "SL.UEM.TOTL.ZS": {
        "name": "Unemployment Rate",
        "unit": "% of total labor force",
        "description": "Share of the labor force without work but available for and seeking employment (ILO estimate).",
    },
    "BN.CAB.XOKA.GD.ZS": {
        "name": "Current Account Balance",
        "unit": "% of GDP",
        "description": "Sum of net exports of goods and services, net primary income, and net secondary income (% of GDP).",
    },
    "GC.DOD.TOTL.GD.ZS": {
        "name": "Central Government Debt",
        "unit": "% of GDP",
        "description": "Entire stock of direct government fixed-term contractual obligations (% of GDP).",
    },
    "NY.GDP.PCAP.KD": {
        "name": "GDP per Capita",
        "unit": "Constant 2015 USD",
        "description": "Gross domestic product divided by midyear population in constant 2015 U.S. dollars.",
    },
}


class WorldBankAdapter(BaseAdapter):
    """World Bank Indicators v2 adapter for India macro research."""

    provider_id = PROVIDER_ID
    cache_ttl_seconds = 86400
    caching_permitted = True

    def __init__(self, cache=None):
        super().__init__(quota_per_day=None, quota_per_minute=None, cache=cache)
        self.last_health = "healthy"

    def get_indicator(
        self,
        indicator_code: str,
        most_recent_values: int = 5,
        skip_cache: bool = False,
    ) -> ProviderResponse:
        """Fetch most recent observations for a curated India macroeconomic indicator."""
        code = indicator_code.strip().upper()
        if code not in INDIA_INDICATORS:
            return make_unavailable(
                PROVIDER_ID,
                f"Unsupported or unverified World Bank indicator code '{code}'.",
                instrument=code,
            )

        mrv = max(1, min(int(most_recent_values), 20))
        cache_key = f"ind:{code}:mrv:{mrv}"
        meta_def = INDIA_INDICATORS[code]

        def _fetch() -> ProviderResponse:
            url = f"{BASE_URL}/country/IN/indicator/{code}"
            try:
                raw = self._make_request(url, params={"format": "json", "mrv": mrv})
            except QuotaExhaustedError as exc:
                return make_unavailable(PROVIDER_ID, str(exc), status="quota_exhausted", instrument=code)
            except Exception as exc:
                logger.warning("[WorldBank] get_indicator %s error: %s", code, exc)
                return make_unavailable(PROVIDER_ID, f"Request failed: {exc}", instrument=code)

            # World Bank returns [{"message": [...]}] on API error even with HTTP 200
            if isinstance(raw, list) and raw and isinstance(raw[0], dict) and "message" in raw[0]:
                msg_list = raw[0].get("message") or []
                msg_text = "; ".join(str(m.get("value", "")) for m in msg_list) or "World Bank API error"
                return make_unavailable(PROVIDER_ID, msg_text, status="error", instrument=code)

            if not isinstance(raw, list) or len(raw) < 2:
                return make_unavailable(PROVIDER_ID, "Unexpected World Bank response structure.", instrument=code)

            metadata = raw[0] or {}
            observations = raw[1] or []
            valid_obs: List[Dict[str, Any]] = [o for o in observations if o.get("value") is not None]
            valid_obs.sort(key=lambda o: str(o.get("date", "")), reverse=True)

            if not valid_obs:
                return make_unavailable(PROVIDER_ID, f"No reported observations for {code} (India).", instrument=code)

            parsed = [
                {
                    "period": str(o.get("date")),
                    "date": str(o.get("date")),
                    "value": round(float(o["value"]), 4),
                    "indicator_code": code,
                    "indicator_name": meta_def["name"],
                    "unit": meta_def["unit"],
                    "country": "India",
                }
                for o in valid_obs
                if o.get("date")
            ]

            most_recent_period = parsed[0]["period"] if parsed else None

            return ProviderResponse(
                provider_id=PROVIDER_ID,
                source=PROVIDER_ID,
                data={
                    "indicator_code": code,
                    "indicator_name": meta_def["name"],
                    "unit": meta_def["unit"],
                    "description": meta_def["description"],
                    "country": "India",
                    "frequency": "Annual",
                    "observations": parsed,
                    "last_updated": metadata.get("lastupdated"),
                    "disclaimer": (
                        "Annual/revised macroeconomic statistic from World Bank Open Data (CC BY 4.0). "
                        "Not intraday market data; not investment advice."
                    ),
                },
                instrument=code,
                currency="USD" if "USD" in meta_def["unit"] else None,
                unit=meta_def["unit"],
                observation_time=most_recent_period,
                published_at=metadata.get("lastupdated"),
                freshness="END_OF_DAY",
                status="ok",
                source_url=f"https://data.worldbank.org/indicator/{code}?locations=IN",
            )

        return self._cached_coalesced_fetch(cache_key, _fetch, skip_cache=skip_cache)

    def get_india_macro_summary(self, skip_cache: bool = False) -> ProviderResponse:
        """Fetch the curated India macroeconomic research panel."""
        cache_key = "summary:IN:v1"

        def _fetch() -> ProviderResponse:
            summary: Dict[str, Any] = {}
            missing: List[str] = []
            latest_period: Optional[str] = None
            latest_updated: Optional[str] = None

            for code in INDIA_INDICATORS:
                resp = self.get_indicator(code, most_recent_values=3, skip_cache=skip_cache)
                if resp.status == "ok" and resp.data:
                    summary[code] = resp.data
                    if resp.observation_time and (latest_period is None or resp.observation_time > latest_period):
                        latest_period = resp.observation_time
                    if resp.published_at and (latest_updated is None or resp.published_at > latest_updated):
                        latest_updated = resp.published_at
                else:
                    missing.append(f"{code}: {resp.unavailable_reason}")

            if not summary:
                return make_unavailable(
                    PROVIDER_ID, f"All India macro indicators unavailable: {'; '.join(missing)}"
                )

            return ProviderResponse(
                provider_id=PROVIDER_ID,
                source=PROVIDER_ID,
                data={
                    "country": "India",
                    "frequency": "Annual / Revised",
                    "indicators": summary,
                    "missing_indicators": missing,
                    "disclaimer": (
                        "Annual or quarterly macroeconomic statistics from World Bank Open Data (CC BY 4.0). "
                        "NOT intraday trading data. NOT investment advice."
                    ),
                },
                instrument="IN",
                unit="Mixed macro units (see per-indicator unit)",
                observation_time=latest_period,
                published_at=latest_updated,
                freshness="END_OF_DAY",
                status="ok",
                source_url="https://data.worldbank.org/country/india",
            )

        return self._cached_coalesced_fetch(cache_key, _fetch, skip_cache=skip_cache)

    def fetch(self, **kwargs) -> ProviderResponse:
        code = kwargs.get("indicator_code")
        if code:
            return self.get_indicator(code)
        return self.get_india_macro_summary()


worldbank = WorldBankAdapter()
