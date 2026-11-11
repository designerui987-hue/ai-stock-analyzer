"""
Alpha Vantage Research Adapter.

Official docs: https://www.alphavantage.co/documentation/
Free tier limits: 25 API requests/day, 5 requests/minute.
Configuration: Read strictly via central validated `Settings`.

VERIFIED CAPABILITIES & RESTRICTIONS:
- Does NOT supply free live NSE quotes.
- `TIME_SERIES_DAILY_ADJUSTED` requires `ALPHA_VANTAGE_PLAN=premium` and parses real
  adjustment fields (`5. adjusted close`, `7. dividend amount`, `8. split coefficient`).
  It NEVER delegates to unadjusted `get_daily_eod()`.
- Only explicit BSE symbols (`.BSE` / `.BO` with `exchange="BSE"`) are supported for Indian EOD;
  NSE or mismatched exchange requests fail closed without silent substitution.
"""

import logging
import re
from typing import Iterable, List, Optional, Tuple

from config import Settings, get_settings
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
_SYMBOL_RE = re.compile(r"^[A-Z0-9][A-Z0-9._-]{0,24}$")


def _is_av_quota_or_premium_msg(raw: dict) -> Optional[Tuple[str, bool]]:
    """
    Detect Alpha Vantage rate-limit / daily-limit / premium messages returned inside HTTP 200.
    Returns (message, is_daily_or_terminal).
    """
    if not isinstance(raw, dict):
        return None
    if "Note" in raw:
        # "Note" is typically 5/minute burst call-frequency throttling
        msg = str(raw["Note"])
        is_daily = "day" in msg.lower() or "25" in msg
        return msg, is_daily
    if "Information" in raw:
        msg = str(raw["Information"])
        is_daily = "daily" in msg.lower() or "25 requests" in msg.lower()
        return msg, is_daily
    return None


class AlphaVantageAdapter(BaseAdapter):
    """Async Alpha Vantage EOD research adapter (strictly non-live, BSE EOD / FX only)."""

    provider_id = PROVIDER_ID
    cache_ttl_seconds = 3600
    caching_permitted = True

    def __init__(self, cache=None, app_settings: Optional[Settings] = None):
        super().__init__(quota_per_day=25, quota_per_minute=5, cache=cache)
        self._settings: Settings = app_settings or get_settings(reload=True)
        self._api_key: Optional[str] = (self._settings.alpha_vantage_api_key or "").strip() or None
        self._plan: str = (self._settings.alpha_vantage_plan or "free").strip().lower()
        self.last_health = "unverified" if self.is_configured else "key_required"

    def _secrets_to_redact(self) -> Iterable[Optional[str]]:
        return (self._api_key,)

    @property
    def is_configured(self) -> bool:
        return bool(self._api_key)

    @staticmethod
    def _validate_bse_symbol(symbol: str, exchange: str) -> Tuple[Optional[str], Optional[str]]:
        """
        Validate explicit exchange & symbol integrity.
        Never converts NSE -> BSE; rejects ambiguous or mismatched exchange identifiers.
        """
        clean = (symbol or "").strip().upper()
        ex_upper = (exchange or "").strip().upper()

        if not clean or not _SYMBOL_RE.match(clean):
            return None, f"Invalid or ambiguous equity symbol '{symbol}'."

        if ex_upper == "NSE" or clean.endswith(".NS") or clean.endswith(":NSE"):
            return None, (
                f"Unsupported NSE symbol '{clean}': Alpha Vantage free plan does not "
                "provide free live NSE quotes or reliable NSE coverage. "
                "Use explicit BSE exchange and symbol (e.g. RELIANCE.BSE) for EOD research only."
            )

        if ex_upper != "BSE":
            return None, f"Unsupported exchange '{exchange}' for Alpha Vantage Indian research (BSE only)."

        if "." in clean and not (clean.endswith(".BSE") or clean.endswith(".BO")):
            return None, f"Symbol '{clean}' carries non-BSE suffix incompatible with exchange='BSE'."

        av_symbol = clean[:-3] + ".BSE" if clean.endswith(".BO") else clean
        if not av_symbol.endswith(".BSE"):
            av_symbol = f"{av_symbol}.BSE"
        return av_symbol, None

    async def _execute_daily_series(
        self,
        symbol: str,
        exchange: str,
        adjusted: bool,
        skip_cache: bool,
    ) -> ProviderResponse:
        if not self.is_configured:
            return make_unavailable(
                PROVIDER_ID,
                "ALPHA_VANTAGE_API_KEY not configured.",
                instrument=symbol,
                exchange=exchange,
            )

        av_symbol, err = self._validate_bse_symbol(symbol, exchange)
        if err or not av_symbol:
            return make_unavailable(PROVIDER_ID, err or "Invalid symbol.", instrument=symbol, exchange=exchange)

        if adjusted and self._plan != "premium":
            return make_unavailable(
                PROVIDER_ID,
                (
                    "Alpha Vantage TIME_SERIES_DAILY_ADJUSTED is a paid/premium endpoint and "
                    "is disabled on the configured plan (requires ALPHA_VANTAGE_PLAN=premium)."
                ),
                instrument=av_symbol,
                exchange="BSE",
            )

        fn_name = "TIME_SERIES_DAILY_ADJUSTED" if adjusted else "TIME_SERIES_DAILY"
        basis = "adjusted" if adjusted else "unadjusted"
        cache_key = f"daily_{basis}:BSE:{av_symbol}"

        async def _fetch() -> ProviderResponse:
            params = {
                "function": fn_name,
                "symbol": av_symbol,
                "outputsize": "compact",
                "apikey": self._api_key,
            }
            try:
                raw = await self._make_request(BASE_URL, params=params, credit_weight=1)
            except QuotaExhaustedError as exc:
                return make_unavailable(
                    PROVIDER_ID,
                    f"Alpha Vantage rate/quota limit reached: {exc}",
                    status="quota_exhausted",
                    instrument=av_symbol,
                    exchange="BSE",
                )
            except Exception as exc:
                safe_err = redact_secrets(str(exc), self._secrets_to_redact())
                logger.warning("[AlphaVantage] %s error for %s: %s", fn_name, av_symbol, safe_err)
                return make_unavailable(
                    PROVIDER_ID, f"Request failed: {safe_err}", instrument=av_symbol, exchange="BSE"
                )

            if not isinstance(raw, dict):
                return make_unavailable(
                    PROVIDER_ID, "Unexpected non-JSON response.", instrument=av_symbol, exchange="BSE"
                )

            quota_info = _is_av_quota_or_premium_msg(raw)
            if quota_info:
                msg, is_daily = quota_info
                if is_daily:
                    await self.mark_daily_exhausted()
                else:
                    await self.mark_rate_limited(60)
                return make_unavailable(
                    PROVIDER_ID,
                    redact_secrets(msg, self._secrets_to_redact()),
                    status="quota_exhausted",
                    instrument=av_symbol,
                    exchange="BSE",
                )

            if "Error Message" in raw:
                return make_unavailable(
                    PROVIDER_ID,
                    redact_secrets(str(raw["Error Message"]), self._secrets_to_redact()),
                    status="unavailable",
                    instrument=av_symbol,
                    exchange="BSE",
                )

            meta = raw.get("Meta Data")
            if isinstance(meta, dict) and meta.get("2. Symbol"):
                returned_sym = str(meta["2. Symbol"]).strip().upper()
                if returned_sym != av_symbol:
                    return make_unavailable(
                        PROVIDER_ID,
                        f"Instrument mismatch: requested {av_symbol}, got {returned_sym}.",
                        instrument=av_symbol,
                        exchange="BSE",
                    )

            time_series = raw.get("Time Series (Daily)")
            if not isinstance(time_series, dict) or not time_series:
                return make_unavailable(
                    PROVIDER_ID,
                    f"No EOD daily time series returned for {av_symbol}.",
                    instrument=av_symbol,
                    exchange="BSE",
                )

            dates = sorted(time_series.keys(), reverse=True)
            candles: List[dict] = []
            try:
                for d in dates:
                    row = time_series[d]
                    if not isinstance(row, dict):
                        continue
                    candle = {
                        "date": d,
                        "open": float(row["1. open"]),
                        "high": float(row["2. high"]),
                        "low": float(row["3. low"]),
                        "close": float(row["4. close"]),
                    }
                    if adjusted:
                        # Strictly require adjusted fields when returning adjusted series
                        if "5. adjusted close" not in row:
                            return make_unavailable(
                                PROVIDER_ID,
                                f"Adjusted close field missing in upstream response for {av_symbol}.",
                                instrument=av_symbol,
                                exchange="BSE",
                            )
                        candle["adjusted_close"] = float(row["5. adjusted close"])
                        candle["volume"] = int(float(row.get("6. volume", 0)))
                        candle["dividend_amount"] = float(row.get("7. dividend amount", 0.0))
                        candle["split_coefficient"] = float(row.get("8. split coefficient", 1.0))
                    else:
                        candle["volume"] = int(float(row.get("5. volume", 0)))
                    candles.append(candle)
            except (TypeError, ValueError, KeyError) as exc:
                return make_unavailable(
                    PROVIDER_ID,
                    f"Malformed OHLCV candle payload for {av_symbol}: {exc}",
                    instrument=av_symbol,
                    exchange="BSE",
                )

            if not candles:
                return make_unavailable(
                    PROVIDER_ID,
                    f"No valid candles parsed for {av_symbol}.",
                    instrument=av_symbol,
                    exchange="BSE",
                )

            most_recent_date = candles[0]["date"]
            return ProviderResponse(
                provider_id=PROVIDER_ID,
                source=PROVIDER_ID,
                data={
                    "symbol": av_symbol,
                    "exchange": "BSE",
                    "adjustment_basis": basis,
                    "candles": candles,
                    "disclaimer": (
                        f"END OF DAY ({basis} BSE series via Alpha Vantage). "
                        "Live NSE quotes are unavailable here; NOT for intraday execution."
                    ),
                },
                instrument=av_symbol,
                exchange="BSE",
                currency="INR",
                unit=f"OHLCV (EOD {basis})",
                observation_time=most_recent_date,
                freshness="END_OF_DAY",
                status="ok",
                source_url=(
                    "https://www.alphavantage.co/documentation/#dailyadj"
                    if adjusted
                    else "https://www.alphavantage.co/documentation/#daily"
                ),
            )

        return await self._cached_coalesced_fetch(cache_key, _fetch, skip_cache=skip_cache)

    async def get_daily_eod(
        self,
        symbol: str,
        exchange: str = "BSE",
        skip_cache: bool = False,
    ) -> ProviderResponse:
        """Fetch unadjusted daily EOD OHLCV (`TIME_SERIES_DAILY`, BSE only)."""
        return await self._execute_daily_series(symbol, exchange=exchange, adjusted=False, skip_cache=skip_cache)

    async def get_daily_adjusted(
        self,
        symbol: str,
        exchange: str = "BSE",
        skip_cache: bool = False,
    ) -> ProviderResponse:
        """
        Fetch dividend/split-adjusted daily EOD OHLCV (`TIME_SERIES_DAILY_ADJUSTED`).
        Requires `ALPHA_VANTAGE_PLAN=premium`; NEVER delegates to unadjusted EOD data.
        """
        return await self._execute_daily_series(symbol, exchange=exchange, adjusted=True, skip_cache=skip_cache)

    async def get_fx_rate(
        self, from_currency: str, to_currency: str, skip_cache: bool = False
    ) -> ProviderResponse:
        """Fetch FX reference rate via Alpha Vantage CURRENCY_EXCHANGE_RATE."""
        if not self.is_configured:
            return make_unavailable(PROVIDER_ID, "ALPHA_VANTAGE_API_KEY not configured.")

        from_c = from_currency.strip().upper()
        to_c = to_currency.strip().upper()
        if len(from_c) != 3 or len(to_c) != 3 or not from_c.isalpha() or not to_c.isalpha():
            return make_unavailable(PROVIDER_ID, f"Invalid ISO currency pair: {from_c}/{to_c}")

        cache_key = f"fx:{from_c}:{to_c}"

        async def _fetch() -> ProviderResponse:
            params = {
                "function": "CURRENCY_EXCHANGE_RATE",
                "from_currency": from_c,
                "to_currency": to_c,
                "apikey": self._api_key,
            }
            try:
                raw = await self._make_request(BASE_URL, params=params, credit_weight=1)
            except QuotaExhaustedError as exc:
                return make_unavailable(PROVIDER_ID, str(exc), status="quota_exhausted")
            except Exception as exc:
                safe_err = redact_secrets(str(exc), self._secrets_to_redact())
                return make_unavailable(PROVIDER_ID, f"Request failed: {safe_err}")

            if not isinstance(raw, dict):
                return make_unavailable(PROVIDER_ID, "Malformed non-object response from Alpha Vantage.")

            quota_info = _is_av_quota_or_premium_msg(raw)
            if quota_info:
                msg, is_daily = quota_info
                if is_daily:
                    await self.mark_daily_exhausted()
                else:
                    await self.mark_rate_limited(60)
                return make_unavailable(
                    PROVIDER_ID,
                    redact_secrets(msg, self._secrets_to_redact()),
                    status="quota_exhausted",
                )

            fx_data = raw.get("Realtime Currency Exchange Rate")
            if not isinstance(fx_data, dict):
                return make_unavailable(PROVIDER_ID, f"FX rate unavailable for {from_c}/{to_c}.")

            rate = fx_data.get("5. Exchange Rate")
            last_refreshed = fx_data.get("6. Last Refreshed") or None
            if not rate or not last_refreshed:
                return make_unavailable(PROVIDER_ID, f"FX rate or timestamp unavailable for {from_c}/{to_c}.")

            try:
                numeric_rate = float(rate)
            except (TypeError, ValueError):
                return make_unavailable(PROVIDER_ID, f"Malformed numeric FX rate for {from_c}/{to_c}.")

            return ProviderResponse(
                provider_id=PROVIDER_ID,
                source=PROVIDER_ID,
                data={
                    "rate": numeric_rate,
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

        return await self._cached_coalesced_fetch(cache_key, _fetch, skip_cache=skip_cache)

    async def fetch(self, **kwargs) -> ProviderResponse:
        symbol = kwargs.get("symbol")
        if symbol:
            return await self.get_daily_eod(symbol, exchange=kwargs.get("exchange", "BSE"))
        return make_unavailable(PROVIDER_ID, "No symbol provided.")


alpha_vantage = AlphaVantageAdapter()
