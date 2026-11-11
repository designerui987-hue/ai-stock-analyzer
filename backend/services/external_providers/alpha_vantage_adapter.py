"""
Alpha Vantage Research Adapter.

Official docs: https://www.alphavantage.co/documentation/
Free tier limits: 25 API requests/day, 5 requests/minute.
Key env var: ALPHA_VANTAGE_API_KEY (optional, server-side only).
Plan env var: ALPHA_VANTAGE_PLAN ("free" default | "premium").

VERIFIED CAPABILITIES & RESTRICTIONS:
- Does NOT supply free live NSE quotes.
- `TIME_SERIES_DAILY_ADJUSTED` is a PREMIUM endpoint on Alpha Vantage (returns `"Information"`
  notice on free keys) -> explicitly DISABLED unless `ALPHA_VANTAGE_PLAN=premium`.
- NSE symbol routing (`.NS` / `exchange="NSE"`) is disabled on free tier because Alpha Vantage
  international coverage focuses on limited BSE symbols (`.BSE`) with inconsistent reliability
  and unadjusted daily EOD (`TIME_SERIES_DAILY`).
- Detects HTTP 200 responses containing `"Note"`, `"Information"`, or `"Error Message"`.
- Never leaks `ALPHA_VANTAGE_API_KEY` in URLs, errors, or logs.
"""

import logging
import os
from typing import Iterable, List, Optional

from services.external_providers.base import (
    BaseAdapter,
    ProviderResponse,
    QuotaExhaustedError,
    make_unavailable,
    redact_secrets,
)

logger = logging.getLogger("external_providers.alpha_vantage")

PROVIDER_ID = "alpha_vantage"
BASE_URL = "https://www.alphavantage.co/query"


def _is_av_quota_or_premium_msg(raw: dict) -> Optional[str]:
    """Detect Alpha Vantage quota or premium-tier messages returned inside HTTP 200."""
    if not isinstance(raw, dict):
        return None
    if "Note" in raw:
        return str(raw["Note"])
    if "Information" in raw:
        return str(raw["Information"])
    return None


class AlphaVantageAdapter(BaseAdapter):
    """Alpha Vantage EOD research adapter (strictly non-live, BSE EOD / FX only)."""

    provider_id = PROVIDER_ID
    cache_ttl_seconds = 3600
    caching_permitted = True

    def __init__(self, cache=None):
        super().__init__(quota_per_day=25, quota_per_minute=5, cache=cache)
        self._api_key: Optional[str] = os.environ.get("ALPHA_VANTAGE_API_KEY") or None
        self._plan: str = (os.environ.get("ALPHA_VANTAGE_PLAN") or "free").strip().lower()
        self.last_health = "healthy" if self._api_key else "key_required"

    def _secrets_to_redact(self) -> Iterable[Optional[str]]:
        return (self._api_key,)

    @property
    def is_configured(self) -> bool:
        return bool(self._api_key and self._api_key.strip())

    def get_daily_eod(
        self,
        symbol: str,
        exchange: str = "BSE",
        skip_cache: bool = False,
    ) -> ProviderResponse:
        """
        Fetch daily EOD OHLCV (`TIME_SERIES_DAILY`, unadjusted on free plan).
        Explicitly rejects NSE requests on the free tier rather than silently substituting BSE.
        """
        if not self.is_configured:
            return make_unavailable(
                PROVIDER_ID,
                "ALPHA_VANTAGE_API_KEY not configured.",
                instrument=symbol,
            )

        clean = symbol.strip().upper()
        ex_upper = exchange.strip().upper()

        # Refuse NSE symbols/requests instead of silently falling back to BSE (different exchange/liquidity)
        if clean.endswith(".NS") or clean.endswith(":NSE") or ex_upper == "NSE":
            return make_unavailable(
                PROVIDER_ID,
                (
                    f"Unsupported NSE symbol '{clean}': Alpha Vantage free plan does not "
                    "provide free live NSE quotes or reliable NSE coverage. "
                    "Use explicit BSE suffix (e.g. RELIANCE.BSE) for EOD research only."
                ),
                instrument=clean,
            )

        av_symbol = clean.replace(".BO", ".BSE")
        if not av_symbol.endswith(".BSE") and "." not in av_symbol:
            av_symbol = f"{av_symbol}.BSE"

        cache_key = f"daily_eod:{av_symbol}"

        def _fetch() -> ProviderResponse:
            params = {
                "function": "TIME_SERIES_DAILY",
                "symbol": av_symbol,
                "outputsize": "compact",
                "apikey": self._api_key,
            }
            try:
                raw = self._make_request(BASE_URL, params=params, credit_weight=1)
            except QuotaExhaustedError as exc:
                return make_unavailable(
                    PROVIDER_ID,
                    f"Alpha Vantage quota exhausted (25 req/day free limit): {exc}",
                    status="quota_exhausted",
                    instrument=av_symbol,
                )
            except Exception as exc:
                safe_err = redact_secrets(str(exc), self._secrets_to_redact())
                logger.warning("[AlphaVantage] get_daily_eod error for %s: %s", av_symbol, safe_err)
                return make_unavailable(PROVIDER_ID, f"Request failed: {safe_err}", instrument=av_symbol)

            if not isinstance(raw, dict):
                return make_unavailable(PROVIDER_ID, "Unexpected non-JSON response.", instrument=av_symbol)

            quota_msg = _is_av_quota_or_premium_msg(raw)
            if quota_msg:
                self.mark_quota_exhausted()
                return make_unavailable(
                    PROVIDER_ID,
                    redact_secrets(quota_msg, self._secrets_to_redact()),
                    status="quota_exhausted",
                    instrument=av_symbol,
                )

            if "Error Message" in raw:
                return make_unavailable(
                    PROVIDER_ID,
                    redact_secrets(str(raw["Error Message"]), self._secrets_to_redact()),
                    status="unavailable",
                    instrument=av_symbol,
                )

            time_series = raw.get("Time Series (Daily)") or {}
            if not time_series:
                return make_unavailable(
                    PROVIDER_ID,
                    f"No EOD daily time series returned for {av_symbol}.",
                    instrument=av_symbol,
                )

            dates = sorted(time_series.keys(), reverse=True)
            candles: List[dict] = []
            for d in dates:
                row = time_series[d] or {}
                candles.append({
                    "date": d,
                    "open": float(row.get("1. open", 0)),
                    "high": float(row.get("2. high", 0)),
                    "low": float(row.get("3. low", 0)),
                    "close": float(row.get("4. close", 0)),
                    "volume": int(float(row.get("5. volume", 0))),
                })

            most_recent_date = dates[0] if dates else None

            return ProviderResponse(
                provider_id=PROVIDER_ID,
                source=PROVIDER_ID,
                data={
                    "symbol": av_symbol,
                    "exchange": "BSE",
                    "adjustment_basis": "unadjusted",
                    "candles": candles,
                    "disclaimer": (
                        "END OF DAY (unadjusted BSE series via Alpha Vantage free plan). "
                        "Live NSE quotes are unavailable here; NOT for intraday execution."
                    ),
                },
                instrument=av_symbol,
                currency="INR",
                unit="OHLCV (EOD unadjusted)",
                observation_time=most_recent_date,
                freshness="END_OF_DAY",
                status="ok",
                source_url="https://www.alphavantage.co/documentation/#daily",
            )

        return self._cached_coalesced_fetch(cache_key, _fetch, skip_cache=skip_cache)

    def get_daily_adjusted(self, symbol: str, skip_cache: bool = False) -> ProviderResponse:
        """
        `TIME_SERIES_DAILY_ADJUSTED` requires a paid/premium Alpha Vantage plan.
        Disabled cleanly on the free plan without making wasted upstream calls.
        """
        if not self.is_configured:
            return make_unavailable(PROVIDER_ID, "ALPHA_VANTAGE_API_KEY not configured.", instrument=symbol)

        if self._plan != "premium":
            return make_unavailable(
                PROVIDER_ID,
                (
                    "Alpha Vantage TIME_SERIES_DAILY_ADJUSTED is a paid/premium endpoint and "
                    "is disabled on the configured free plan (ALPHA_VANTAGE_PLAN=free)."
                ),
                instrument=symbol,
            )

        return self.get_daily_eod(symbol, skip_cache=skip_cache)

    def get_fx_rate(
        self, from_currency: str, to_currency: str, skip_cache: bool = False
    ) -> ProviderResponse:
        """Fetch FX reference rate via Alpha Vantage CURRENCY_EXCHANGE_RATE."""
        if not self.is_configured:
            return make_unavailable(PROVIDER_ID, "ALPHA_VANTAGE_API_KEY not configured.")

        from_c = from_currency.strip().upper()
        to_c = to_currency.strip().upper()
        cache_key = f"fx:{from_c}:{to_c}"

        def _fetch() -> ProviderResponse:
            params = {
                "function": "CURRENCY_EXCHANGE_RATE",
                "from_currency": from_c,
                "to_currency": to_c,
                "apikey": self._api_key,
            }
            try:
                raw = self._make_request(BASE_URL, params=params, credit_weight=1)
            except QuotaExhaustedError as exc:
                return make_unavailable(PROVIDER_ID, str(exc), status="quota_exhausted")
            except Exception as exc:
                safe_err = redact_secrets(str(exc), self._secrets_to_redact())
                return make_unavailable(PROVIDER_ID, f"Request failed: {safe_err}")

            quota_msg = _is_av_quota_or_premium_msg(raw)
            if quota_msg:
                self.mark_quota_exhausted()
                return make_unavailable(
                    PROVIDER_ID,
                    redact_secrets(quota_msg, self._secrets_to_redact()),
                    status="quota_exhausted",
                )

            fx_data = raw.get("Realtime Currency Exchange Rate") or {}
            rate = fx_data.get("5. Exchange Rate")
            last_refreshed = fx_data.get("6. Last Refreshed") or None

            if not rate:
                return make_unavailable(PROVIDER_ID, f"FX rate unavailable for {from_c}/{to_c}.")

            return ProviderResponse(
                provider_id=PROVIDER_ID,
                source=PROVIDER_ID,
                data={
                    "rate": float(rate),
                    "from_currency": from_c,
                    "to_currency": to_c,
                    "disclaimer": "REFERENCE RATE via Alpha Vantage. Not an executable FX quote.",
                },
                instrument=f"{from_c}/{to_c}",
                currency=to_c,
                unit=f"{to_c} per 1 {from_c}",
                observation_time=last_refreshed,
                freshness="REFERENCE_RATE",
                status="ok",
                source_url="https://www.alphavantage.co/documentation/#currency-exchange",
            )

        return self._cached_coalesced_fetch(cache_key, _fetch, skip_cache=skip_cache)

    def fetch(self, **kwargs) -> ProviderResponse:
        symbol = kwargs.get("symbol")
        if symbol:
            return self.get_daily_eod(symbol, exchange=kwargs.get("exchange", "BSE"))
        return make_unavailable(PROVIDER_ID, "No symbol provided.")


alpha_vantage = AlphaVantageAdapter()
