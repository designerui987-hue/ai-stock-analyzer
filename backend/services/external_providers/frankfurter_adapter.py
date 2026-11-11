"""
Frankfurter FX Reference Rate Adapter.

Official API: https://api.frankfurter.dev/v1 (https://frankfurter.dev)
Source: European Central Bank (ECB) reference exchange rates.
Authentication: None required (fair-use policy).
Update frequency: Once per ECB working day around 16:00 CET.
Caching: Historical rates are immutable (safe to cache long); latest rates cached 1h.
Redistribution: Fair-use public API; subject to upstream ECB terms. High-volume traffic
                should self-host Frankfurter Docker image.

CRITICAL WORKFLOW BOUNDARY:
All rates are REFERENCE RATES only — NOT executable FX bid/ask prices.
"""

import logging
from datetime import date, timedelta
from typing import List, Optional

from services.external_providers.base import (
    BaseAdapter,
    ProviderResponse,
    QuotaExhaustedError,
    make_unavailable,
)

logger = logging.getLogger("external_providers.frankfurter")

PROVIDER_ID = "frankfurter"
BASE_URL = "https://api.frankfurter.dev/v1"
DEFAULT_CURRENCIES = ["USD", "EUR", "GBP", "JPY"]


class FrankfurterAdapter(BaseAdapter):
    """ECB reference FX rates via Frankfurter v1 API."""

    provider_id = PROVIDER_ID
    cache_ttl_seconds = 3600
    caching_permitted = True

    def __init__(self, cache=None):
        super().__init__(quota_per_day=None, quota_per_minute=None, cache=cache)
        self.last_health = "healthy"

    @staticmethod
    def _parse_date(date_str: Optional[str]) -> Optional[str]:
        if not date_str:
            return None
        try:
            return date.fromisoformat(str(date_str).strip()).isoformat()
        except (TypeError, ValueError):
            return None

    def get_usd_inr_rate(self, skip_cache: bool = False) -> ProviderResponse:
        """Fetch latest USD/INR ECB reference rate."""
        return self.get_rate("USD", "INR", skip_cache=skip_cache)

    def get_inr_basket(self, base: str = "INR", skip_cache: bool = False) -> ProviderResponse:
        """
        Fetch reference exchange rates for USD, EUR, GBP, JPY relative to INR
        with USD/INR highlighted cleanly for research context.
        """
        symbols = ",".join(DEFAULT_CURRENCIES)
        cache_key = f"basket:{base.upper()}:{symbols}"

        def _fetch() -> ProviderResponse:
            try:
                raw = self._make_request(
                    f"{BASE_URL}/latest",
                    params={"base": "USD", "symbols": "INR"},
                )
                # Also fetch INR-based reference rates vs USD/EUR/GBP/JPY
                basket_raw = self._make_request(
                    f"{BASE_URL}/latest",
                    params={"base": "INR", "symbols": "USD,EUR,GBP,JPY"},
                )
            except QuotaExhaustedError as exc:
                return make_unavailable(PROVIDER_ID, str(exc), status="quota_exhausted")
            except Exception as exc:
                return make_unavailable(PROVIDER_ID, f"Frankfurter request failed: {exc}")

            obs_date = self._parse_date(raw.get("date") or basket_raw.get("date"))
            usd_inr = raw.get("rates", {}).get("INR")
            inr_rates = basket_raw.get("rates", {})

            if usd_inr is None or obs_date is None:
                return make_unavailable(
                    PROVIDER_ID,
                    "Frankfurter response missing required rate or effective date.",
                )

            cross_to_inr: List[dict] = [{"pair": "USD/INR", "rate": round(float(usd_inr), 4)}]
            for ccy in ("EUR", "GBP", "JPY"):
                val = inr_rates.get(ccy)
                if val and float(val) > 0:
                    cross_to_inr.append({
                        "pair": f"{ccy}/INR",
                        "rate": round(1.0 / float(val), 4),
                    })

            return ProviderResponse(
                provider_id=PROVIDER_ID,
                source=PROVIDER_ID,
                data={
                    "usd_inr": round(float(usd_inr), 4),
                    "effective_date": obs_date,
                    "rates_to_inr": cross_to_inr,
                    "raw_inr_base": inr_rates,
                    "label": "REFERENCE RATE",
                    "disclaimer": (
                        "REFERENCE RATES (ECB daily fix ~16:00 CET via Frankfurter). "
                        "Not executable FX prices."
                    ),
                },
                instrument="USD/INR",
                currency="INR",
                unit="INR per foreign currency unit",
                observation_time=obs_date,
                freshness="REFERENCE_RATE",
                status="ok",
                source_url="https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR",
            )

        return self._cached_coalesced_fetch(cache_key, _fetch, skip_cache=skip_cache)

    def get_rate(
        self, from_currency: str, to_currency: str, skip_cache: bool = False
    ) -> ProviderResponse:
        """Fetch latest ECB reference rate between two currency codes."""
        from_c = from_currency.strip().upper()
        to_c = to_currency.strip().upper()
        if len(from_c) != 3 or len(to_c) != 3:
            return make_unavailable(PROVIDER_ID, f"Invalid ISO currency pair: {from_c}/{to_c}")

        cache_key = f"rate:{from_c}:{to_c}"

        def _fetch() -> ProviderResponse:
            try:
                raw = self._make_request(
                    f"{BASE_URL}/latest",
                    params={"base": from_c, "symbols": to_c},
                )
            except QuotaExhaustedError as exc:
                return make_unavailable(
                    PROVIDER_ID, str(exc), status="quota_exhausted", instrument=f"{from_c}/{to_c}"
                )
            except Exception as exc:
                logger.warning("[Frankfurter] get_rate error for %s/%s: %s", from_c, to_c, exc)
                return make_unavailable(
                    PROVIDER_ID, f"Request failed: {exc}", instrument=f"{from_c}/{to_c}"
                )

            rates = raw.get("rates") or {}
            rate_value = rates.get(to_c)
            obs_time = self._parse_date(raw.get("date"))

            if rate_value is None or obs_time is None:
                return make_unavailable(
                    PROVIDER_ID,
                    f"Rate or effective date unavailable for {from_c}/{to_c}.",
                    instrument=f"{from_c}/{to_c}",
                )

            return ProviderResponse(
                provider_id=PROVIDER_ID,
                source=PROVIDER_ID,
                data={
                    "rate": float(rate_value),
                    "from_currency": from_c,
                    "to_currency": to_c,
                    "effective_date": obs_time,
                    "label": "REFERENCE RATE",
                    "disclaimer": (
                        "REFERENCE RATE — ECB benchmark rate published once per working day. "
                        "NOT an executable FX price."
                    ),
                },
                instrument=f"{from_c}/{to_c}",
                currency=to_c,
                unit=f"{to_c} per 1 {from_c}",
                observation_time=obs_time,
                freshness="REFERENCE_RATE",
                status="ok",
                source_url=f"{BASE_URL}/latest?base={from_c}&symbols={to_c}",
            )

        return self._cached_coalesced_fetch(cache_key, _fetch, skip_cache=skip_cache)

    def get_historical_rates(
        self,
        from_currency: str = "USD",
        to_currency: str = "INR",
        days: int = 30,
        skip_cache: bool = False,
    ) -> ProviderResponse:
        """Fetch historical ECB reference rates for context (immutable; cached 24h)."""
        from_c = from_currency.strip().upper()
        to_c = to_currency.strip().upper()
        days_clamped = max(1, min(int(days), 365))
        today = date.today()
        start = today - timedelta(days=days_clamped)
        cache_key = f"hist:{from_c}:{to_c}:{start.isoformat()}:{today.isoformat()}"

        def _fetch() -> ProviderResponse:
            url = f"{BASE_URL}/{start.isoformat()}..{today.isoformat()}"
            try:
                raw = self._make_request(url, params={"base": from_c, "symbols": to_c})
            except QuotaExhaustedError as exc:
                return make_unavailable(PROVIDER_ID, str(exc), status="quota_exhausted")
            except Exception as exc:
                logger.warning("[Frankfurter] history error: %s", exc)
                return make_unavailable(PROVIDER_ID, f"Request failed: {exc}")

            rates_by_date = raw.get("rates") or {}
            history = []
            for d in sorted(rates_by_date.keys()):
                val = (rates_by_date[d] or {}).get(to_c)
                if val is not None:
                    history.append({"date": d, "rate": float(val)})

            if not history:
                return make_unavailable(PROVIDER_ID, f"No historical rates for {from_c}/{to_c}.")

            latest_date = history[-1]["date"]
            return ProviderResponse(
                provider_id=PROVIDER_ID,
                source=PROVIDER_ID,
                data={
                    "from_currency": from_c,
                    "to_currency": to_c,
                    "history": history,
                    "latest_effective_date": latest_date,
                    "label": "REFERENCE RATE",
                    "disclaimer": "REFERENCE RATES — Historical ECB fixings, not executable FX prices.",
                },
                instrument=f"{from_c}/{to_c}",
                currency=to_c,
                unit=f"{to_c} per 1 {from_c}",
                observation_time=latest_date,
                freshness="REFERENCE_RATE",
                status="ok",
                source_url=url,
            )

        return self._cached_coalesced_fetch(
            cache_key, _fetch, ttl_override=86400, skip_cache=skip_cache
        )

    def fetch(self, **kwargs) -> ProviderResponse:
        return self.get_rate(
            kwargs.get("from_currency", "USD"),
            kwargs.get("to_currency", "INR"),
        )


frankfurter = FrankfurterAdapter()
