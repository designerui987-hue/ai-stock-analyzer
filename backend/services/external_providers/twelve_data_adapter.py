"""
Twelve Data Research Adapter.

Official docs: https://twelvedata.com/docs & https://twelvedata.com/terms
Free Basic plan limits: 800 API credits/day, 8 credits/minute (credit-weighted per endpoint).
Configuration: Read strictly via central validated `Settings`.

VERIFIED CAPABILITIES & ENTITLEMENT AUDIT:
1. Under Twelve Data Terms Section 2.3, the Free Basic plan is restricted to internal
   development evaluation only — commercial/staging/production distribution prohibited.
2. Indian NSE/BSE equity feeds require a paid plan (Grow/Pro/Ultra).
3. Exchange, instrument, interval, and currency are validated end-to-end on both request and
   response metadata so BSE/NSE symbols never mix silently.
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

logger = logging.getLogger("external_providers.twelve_data")

PROVIDER_ID = "twelve_data"
BASE_URL = "https://api.twelvedata.com"
PAID_PLANS = frozenset({"grow", "pro", "ultra", "enterprise"})
SUPPORTED_EXCHANGES = frozenset({"NSE", "BSE", "NASDAQ", "NYSE"})
SUPPORTED_INTERVALS = frozenset({"1min", "5min", "15min", "30min", "1h", "1day", "1week", "1month"})
_TICKER_RE = re.compile(r"^[A-Z0-9][A-Z0-9._:-]{0,24}$")


def _is_td_error(raw: object) -> bool:
    return isinstance(raw, dict) and raw.get("status") == "error"


class TwelveDataAdapter(BaseAdapter):
    """Async Twelve Data EOD/delayed research adapter with plan, env, and exchange gating."""

    provider_id = PROVIDER_ID
    cache_ttl_seconds = 3600
    caching_permitted = True

    def __init__(self, cache=None, app_settings: Optional[Settings] = None):
        super().__init__(quota_per_day=800, quota_per_minute=8, cache=cache)
        self._settings: Settings = app_settings or get_settings(reload=True)
        self._api_key: Optional[str] = (self._settings.twelvedata_api_key or "").strip() or None
        self._plan: str = (self._settings.twelvedata_plan or "free").strip().lower()
        self.last_health = "unverified" if self.is_configured else "key_required"

    def _secrets_to_redact(self) -> Iterable[Optional[str]]:
        return (self._api_key,)

    @property
    def is_configured(self) -> bool:
        return bool(self._api_key)

    @staticmethod
    def _resolve_symbol_and_exchange(
        symbol: str, exchange: str = "NSE"
    ) -> Tuple[Optional[str], Optional[str], Optional[str], Optional[str]]:
        """
        Validate explicit symbol + exchange without ever cross-converting NSE <-> BSE.
        Returns (td_symbol, base_ticker, exchange_upper, error_reason).
        """
        clean = (symbol or "").strip().upper()
        ex_upper = (exchange or "").strip().upper()

        if not clean or not _TICKER_RE.match(clean):
            return None, None, None, f"Invalid or ambiguous symbol '{symbol}'."

        if ex_upper not in SUPPORTED_EXCHANGES:
            return None, None, None, f"Unsupported exchange '{exchange}'."

        # Detect explicit suffixes on symbol and ensure no conflict with `exchange`
        if clean.endswith(".NS") or clean.endswith(":NSE"):
            if ex_upper != "NSE":
                return None, None, None, (
                    f"Symbol '{clean}' specifies NSE but exchange='{ex_upper}' was requested."
                )
            base = clean[:-3] if clean.endswith(".NS") else clean[:-4]
        elif clean.endswith(".BO") or clean.endswith(".BSE") or clean.endswith(":BSE"):
            if ex_upper != "BSE":
                return None, None, None, (
                    f"Symbol '{clean}' specifies BSE but exchange='{ex_upper}' was requested."
                )
            if clean.endswith(".BO"):
                base = clean[:-3]
            else:
                base = clean[:-4]
        elif ":" in clean:
            parts = clean.split(":", 1)
            base, sym_ex = parts[0], parts[1]
            if sym_ex != ex_upper:
                return None, None, None, (
                    f"Symbol exchange '{sym_ex}' does not match requested exchange='{ex_upper}'."
                )
        elif "." in clean:
            return None, None, None, f"Unsupported or ambiguous exchange suffix in symbol '{clean}'."
        else:
            base = clean

        if not base or not base.replace("-", "").replace("_", "").isalnum():
            return None, None, None, f"Unsupported ticker format '{clean}'."

        td_symbol = f"{base}:{ex_upper}"
        return td_symbol, base, ex_upper, None

    def _check_entitlement(self, td_symbol: str, ex_upper: str) -> Optional[ProviderResponse]:
        """Verify key, deployment environment, and exchange plan entitlement."""
        if not self.is_configured:
            return make_unavailable(
                PROVIDER_ID,
                "TWELVEDATA_API_KEY not configured.",
                instrument=td_symbol,
                exchange=ex_upper,
            )

        if self._plan not in PAID_PLANS and not self._settings.is_explicit_development:
            return make_unavailable(
                PROVIDER_ID,
                (
                    "Twelve Data free Basic plan terms prohibit production or non-development "
                    "deployment (requires explicit APP_ENV=development or Grow/Pro/Ultra plan)."
                ),
                instrument=td_symbol,
                exchange=ex_upper,
            )

        if ex_upper in ("NSE", "BSE") and self._plan not in PAID_PLANS:
            return make_unavailable(
                PROVIDER_ID,
                (
                    f"{ex_upper} symbol '{td_symbol}' disabled on Twelve Data free Basic plan: "
                    f"India {ex_upper} coverage requires a paid Grow/Pro/Ultra plan and does not "
                    "supply free live equity quotes."
                ),
                instrument=td_symbol,
                exchange=ex_upper,
            )
        return None

    async def _handle_td_error(self, raw: dict, td_symbol: str, ex_upper: str) -> ProviderResponse:
        code = raw.get("code", 0)
        msg = redact_secrets(str(raw.get("message", "Unknown error")), self._secrets_to_redact())
        if code == 429:
            # Separate per-minute 429 bursts from explicit daily exhaustion notices
            if "daily" in msg.lower() or "day" in msg.lower():
                await self.mark_daily_exhausted()
            else:
                await self.mark_rate_limited(60)
            return make_unavailable(
                PROVIDER_ID,
                f"Twelve Data quota/rate limit reached: {msg}",
                status="quota_exhausted",
                instrument=td_symbol,
                exchange=ex_upper,
            )
        return make_unavailable(
            PROVIDER_ID,
            f"TwelveData error {code}: {msg}",
            status="error",
            instrument=td_symbol,
            exchange=ex_upper,
        )

    async def get_time_series(
        self,
        symbol: str,
        interval: str = "1day",
        outputsize: int = 30,
        exchange: str = "NSE",
        skip_cache: bool = False,
    ) -> ProviderResponse:
        """Fetch time series (EOD/delayed research only; never LIVE)."""
        if interval not in SUPPORTED_INTERVALS:
            return make_unavailable(
                PROVIDER_ID,
                f"Unsupported interval '{interval}'.",
                instrument=symbol,
                exchange=exchange,
            )

        td_symbol, base, ex_upper, err = self._resolve_symbol_and_exchange(symbol, exchange)
        if err or not td_symbol or not base or not ex_upper:
            return make_unavailable(PROVIDER_ID, err or "Invalid symbol.", instrument=symbol, exchange=exchange)

        gate = self._check_entitlement(td_symbol, ex_upper)
        if gate is not None:
            return gate

        size = max(1, min(int(outputsize), 100))
        cache_key = f"ts:{ex_upper}:{td_symbol}:{interval}:{size}"

        async def _fetch() -> ProviderResponse:
            params = {
                "symbol": td_symbol,
                "interval": interval,
                "outputsize": size,
                "apikey": self._api_key,
            }
            try:
                raw = await self._make_request(
                    f"{BASE_URL}/time_series", params=params, credit_weight=1
                )
            except QuotaExhaustedError as exc:
                return make_unavailable(
                    PROVIDER_ID, str(exc), status="quota_exhausted", instrument=td_symbol, exchange=ex_upper
                )
            except Exception as exc:
                safe_err = redact_secrets(str(exc), self._secrets_to_redact())
                return make_unavailable(
                    PROVIDER_ID, f"Request failed: {safe_err}", instrument=td_symbol, exchange=ex_upper
                )

            if not isinstance(raw, dict):
                return make_unavailable(
                    PROVIDER_ID, "Malformed non-object TwelveData payload.", instrument=td_symbol, exchange=ex_upper
                )

            if _is_td_error(raw):
                return await self._handle_td_error(raw, td_symbol, ex_upper)

            meta = raw.get("meta") if isinstance(raw.get("meta"), dict) else {}
            returned_ex = str(meta.get("exchange") or "").strip().upper()
            if returned_ex and returned_ex != ex_upper:
                return make_unavailable(
                    PROVIDER_ID,
                    f"Exchange mismatch: requested {ex_upper}, got {returned_ex}.",
                    instrument=td_symbol,
                    exchange=ex_upper,
                )

            returned_interval = str(meta.get("interval") or "").strip()
            if returned_interval and returned_interval != interval:
                return make_unavailable(
                    PROVIDER_ID,
                    f"Interval mismatch: requested {interval}, got {returned_interval}.",
                    instrument=td_symbol,
                    exchange=ex_upper,
                )

            returned_currency = str(meta.get("currency") or "").strip().upper()
            if ex_upper in ("NSE", "BSE") and returned_currency and returned_currency != "INR":
                return make_unavailable(
                    PROVIDER_ID,
                    f"Currency mismatch for {ex_upper}: expected INR, got {returned_currency}.",
                    instrument=td_symbol,
                    exchange=ex_upper,
                )

            returned_sym = str(meta.get("symbol") or "").strip().upper()
            if returned_sym and returned_sym not in (td_symbol, base):
                return make_unavailable(
                    PROVIDER_ID,
                    f"Instrument mismatch: requested {td_symbol}, got {returned_sym}.",
                    instrument=td_symbol,
                    exchange=ex_upper,
                )

            values = raw.get("values")
            if not isinstance(values, list) or not values:
                return make_unavailable(
                    PROVIDER_ID,
                    f"No time series data returned for {td_symbol}.",
                    instrument=td_symbol,
                    exchange=ex_upper,
                )

            candles: List[dict] = []
            try:
                for v in values:
                    if not isinstance(v, dict):
                        continue
                    candles.append({
                        "datetime": v.get("datetime"),
                        "open": float(v["open"]) if v.get("open") is not None else None,
                        "high": float(v["high"]) if v.get("high") is not None else None,
                        "low": float(v["low"]) if v.get("low") is not None else None,
                        "close": float(v["close"]) if v.get("close") is not None else None,
                        "volume": int(float(v["volume"])) if v.get("volume") is not None else None,
                    })
            except (TypeError, ValueError) as exc:
                return make_unavailable(
                    PROVIDER_ID,
                    f"Malformed candle data in TwelveData payload: {exc}",
                    instrument=td_symbol,
                    exchange=ex_upper,
                )

            most_recent_dt = candles[0].get("datetime") if candles else None
            if not candles or not most_recent_dt:
                return make_unavailable(
                    PROVIDER_ID,
                    f"Candles missing observation timestamp for {td_symbol}.",
                    instrument=td_symbol,
                    exchange=ex_upper,
                )

            return ProviderResponse(
                provider_id=PROVIDER_ID,
                source=PROVIDER_ID,
                data={
                    "symbol": td_symbol,
                    "exchange": returned_ex or ex_upper,
                    "interval": interval,
                    "candles": candles,
                    "disclaimer": (
                        "END OF DAY / DELAYED research data via Twelve Data. "
                        "Not live exchange quotes; not for order execution."
                    ),
                },
                instrument=td_symbol,
                exchange=returned_ex or ex_upper,
                currency=returned_currency or ("INR" if ex_upper in ("NSE", "BSE") else "USD"),
                unit=f"OHLCV ({interval})",
                observation_time=most_recent_dt,
                freshness="END_OF_DAY",
                status="ok",
                source_url="https://twelvedata.com/docs#time-series",
            )

        return await self._cached_coalesced_fetch(cache_key, _fetch, skip_cache=skip_cache)

    async def get_quote(
        self, symbol: str, exchange: str = "NSE", skip_cache: bool = False
    ) -> ProviderResponse:
        """Fetch EOD/delayed quote when plan permits. Never labeled LIVE."""
        td_symbol, base, ex_upper, err = self._resolve_symbol_and_exchange(symbol, exchange)
        if err or not td_symbol or not base or not ex_upper:
            return make_unavailable(PROVIDER_ID, err or "Invalid symbol.", instrument=symbol, exchange=exchange)

        gate = self._check_entitlement(td_symbol, ex_upper)
        if gate is not None:
            return gate

        cache_key = f"quote:{ex_upper}:{td_symbol}"

        async def _fetch() -> ProviderResponse:
            params = {"symbol": td_symbol, "apikey": self._api_key}
            try:
                raw = await self._make_request(f"{BASE_URL}/quote", params=params, credit_weight=1)
            except QuotaExhaustedError as exc:
                return make_unavailable(
                    PROVIDER_ID, str(exc), status="quota_exhausted", instrument=td_symbol, exchange=ex_upper
                )
            except Exception as exc:
                safe_err = redact_secrets(str(exc), self._secrets_to_redact())
                return make_unavailable(
                    PROVIDER_ID, f"Request failed: {safe_err}", instrument=td_symbol, exchange=ex_upper
                )

            if not isinstance(raw, dict):
                return make_unavailable(
                    PROVIDER_ID, "Malformed non-object TwelveData quote.", instrument=td_symbol, exchange=ex_upper
                )

            if _is_td_error(raw):
                return await self._handle_td_error(raw, td_symbol, ex_upper)

            returned_ex = str(raw.get("exchange") or "").strip().upper()
            if returned_ex and returned_ex != ex_upper:
                return make_unavailable(
                    PROVIDER_ID,
                    f"Exchange mismatch: requested {ex_upper}, got {returned_ex}.",
                    instrument=td_symbol,
                    exchange=ex_upper,
                )

            returned_currency = str(raw.get("currency") or "").strip().upper()
            if ex_upper in ("NSE", "BSE") and returned_currency and returned_currency != "INR":
                return make_unavailable(
                    PROVIDER_ID,
                    f"Currency mismatch for {ex_upper}: expected INR, got {returned_currency}.",
                    instrument=td_symbol,
                    exchange=ex_upper,
                )

            obs_time = raw.get("datetime") or None
            try:
                price_val = float(raw["close"]) if raw.get("close") is not None else None
                open_val = float(raw["open"]) if raw.get("open") is not None else None
                high_val = float(raw["high"]) if raw.get("high") is not None else None
                low_val = float(raw["low"]) if raw.get("low") is not None else None
            except (TypeError, ValueError):
                return make_unavailable(
                    PROVIDER_ID,
                    f"Malformed numeric fields in quote for {td_symbol}.",
                    instrument=td_symbol,
                    exchange=ex_upper,
                )

            if price_val is None or obs_time is None:
                return make_unavailable(
                    PROVIDER_ID,
                    f"Incomplete quote or missing timestamp for {td_symbol}.",
                    instrument=td_symbol,
                    exchange=ex_upper,
                )

            return ProviderResponse(
                provider_id=PROVIDER_ID,
                source=PROVIDER_ID,
                data={
                    "symbol": td_symbol,
                    "exchange": returned_ex or ex_upper,
                    "name": raw.get("name"),
                    "price": price_val,
                    "open": open_val,
                    "high": high_val,
                    "low": low_val,
                    "volume": raw.get("volume"),
                    "disclaimer": "END OF DAY — Not a live NSE trading quote.",
                },
                instrument=td_symbol,
                exchange=returned_ex or ex_upper,
                currency=returned_currency or ("INR" if ex_upper in ("NSE", "BSE") else "USD"),
                unit="Price",
                observation_time=obs_time,
                freshness="END_OF_DAY",
                status="ok",
                source_url="https://twelvedata.com/docs#quote",
            )

        return await self._cached_coalesced_fetch(
            cache_key, _fetch, ttl_override=300, skip_cache=skip_cache
        )

    async def fetch(self, **kwargs) -> ProviderResponse:
        symbol = kwargs.get("symbol")
        if symbol:
            return await self.get_time_series(symbol, exchange=kwargs.get("exchange", "NSE"))
        return make_unavailable(PROVIDER_ID, "No symbol provided.")


twelve_data = TwelveDataAdapter()
