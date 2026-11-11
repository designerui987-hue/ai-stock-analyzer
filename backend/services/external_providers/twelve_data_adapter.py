"""
Twelve Data Research Adapter.

Official docs: https://twelvedata.com/docs & https://twelvedata.com/terms
Free Basic plan limits: 800 API credits/day, 8 credits/minute (credit-weighted per endpoint).
Key env var: TWELVEDATA_API_KEY (optional, server-side only).
Plan env var: TWELVEDATA_PLAN ("free" default | "grow" | "pro" | "ultra").

VERIFIED CAPABILITIES & ENTITLEMENT AUDIT:
1. Under Twelve Data Terms Section 2.3, the Free Basic plan is restricted to internal
   testing/evaluation only — commercial production and client-facing streaming are prohibited.
2. International exchanges including India's NSE require a paid plan (Grow/Pro/Ultra);
   the free Basic plan does NOT cover live or broad NSE equity data.
3. Credit weights apply per request (`Data Weight * number of symbols`).
4. Errors can arrive inside HTTP 200 JSON (`{"status": "error", "code": 429, ...}`).
5. Research responses are strictly END_OF_DAY or DELAYED — NEVER promoted to LIVE.
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

logger = logging.getLogger("external_providers.twelve_data")

PROVIDER_ID = "twelve_data"
BASE_URL = "https://api.twelvedata.com"
PAID_PLANS = frozenset({"grow", "pro", "ultra", "enterprise"})


def _is_td_error(raw: object) -> bool:
    return isinstance(raw, dict) and raw.get("status") == "error"


class TwelveDataAdapter(BaseAdapter):
    """Twelve Data EOD/delayed research adapter with plan and environment gating."""

    provider_id = PROVIDER_ID
    cache_ttl_seconds = 3600
    caching_permitted = True

    def __init__(self, cache=None):
        super().__init__(quota_per_day=800, quota_per_minute=8, cache=cache)
        self._api_key: Optional[str] = os.environ.get("TWELVEDATA_API_KEY") or None
        self._plan: str = (os.environ.get("TWELVEDATA_PLAN") or "free").strip().lower()
        self._app_env: str = (os.environ.get("APP_ENV") or "development").strip().lower()
        self.last_health = "healthy" if self._api_key else "key_required"

    def _secrets_to_redact(self) -> Iterable[Optional[str]]:
        return (self._api_key,)

    @property
    def is_configured(self) -> bool:
        return bool(self._api_key and self._api_key.strip())

    def _check_entitlement(self, symbol: str) -> Optional[ProviderResponse]:
        """Verify key, deployment environment, and NSE plan entitlement."""
        if not self.is_configured:
            return make_unavailable(
                PROVIDER_ID,
                "TWELVEDATA_API_KEY not configured.",
                instrument=symbol,
            )

        if self._plan not in PAID_PLANS and self._app_env == "production":
            return make_unavailable(
                PROVIDER_ID,
                (
                    "Twelve Data free Basic plan terms prohibit production or end-user deployment "
                    "(requires Grow/Pro/Ultra plan)."
                ),
                instrument=symbol,
            )

        clean = symbol.strip().upper()
        is_indian_exchange = (
            clean.endswith(":NSE")
            or clean.endswith(".NS")
            or clean.endswith(":BSE")
            or "." not in clean
        )
        if is_indian_exchange and self._plan not in PAID_PLANS:
            return make_unavailable(
                PROVIDER_ID,
                (
                    f"NSE symbol '{clean}' disabled on Twelve Data free Basic plan: "
                    "India NSE coverage requires a paid Grow/Pro/Ultra plan and does not "
                    "supply free live NSE quotes."
                ),
                instrument=clean,
            )
        return None

    def get_time_series(
        self,
        symbol: str,
        interval: str = "1day",
        outputsize: int = 30,
        skip_cache: bool = False,
    ) -> ProviderResponse:
        """Fetch time series (EOD/delayed research only; never LIVE)."""
        gate = self._check_entitlement(symbol)
        if gate is not None:
            return gate

        clean = symbol.strip().upper().replace(".NS", "").replace(":NSE", "")
        td_symbol = f"{clean}:NSE" if ":" not in symbol else symbol.strip().upper()
        size = max(1, min(int(outputsize), 100))
        cache_key = f"ts:{td_symbol}:{interval}:{size}"

        def _fetch() -> ProviderResponse:
            params = {
                "symbol": td_symbol,
                "interval": interval,
                "outputsize": size,
                "apikey": self._api_key,
            }
            try:
                raw = self._make_request(
                    f"{BASE_URL}/time_series", params=params, credit_weight=1
                )
            except QuotaExhaustedError as exc:
                return make_unavailable(
                    PROVIDER_ID, str(exc), status="quota_exhausted", instrument=td_symbol
                )
            except Exception as exc:
                safe_err = redact_secrets(str(exc), self._secrets_to_redact())
                return make_unavailable(
                    PROVIDER_ID, f"Request failed: {safe_err}", instrument=td_symbol
                )

            if _is_td_error(raw):
                code = raw.get("code", 0)
                msg = redact_secrets(
                    str(raw.get("message", "Unknown error")), self._secrets_to_redact()
                )
                if code == 429:
                    self.mark_quota_exhausted()
                    return make_unavailable(
                        PROVIDER_ID,
                        f"Twelve Data quota exhausted: {msg}",
                        status="quota_exhausted",
                        instrument=td_symbol,
                    )
                return make_unavailable(
                    PROVIDER_ID,
                    f"TwelveData error {code}: {msg}",
                    status="error",
                    instrument=td_symbol,
                )

            values = raw.get("values") or []
            if not values:
                return make_unavailable(
                    PROVIDER_ID,
                    f"No time series data returned for {td_symbol}.",
                    instrument=td_symbol,
                )

            candles: List[dict] = []
            for v in values:
                candles.append({
                    "datetime": v.get("datetime"),
                    "open": float(v["open"]) if v.get("open") is not None else None,
                    "high": float(v["high"]) if v.get("high") is not None else None,
                    "low": float(v["low"]) if v.get("low") is not None else None,
                    "close": float(v["close"]) if v.get("close") is not None else None,
                    "volume": int(float(v["volume"])) if v.get("volume") is not None else None,
                })

            most_recent_dt = values[0].get("datetime") or None
            meta = raw.get("meta") or {}

            return ProviderResponse(
                provider_id=PROVIDER_ID,
                source=PROVIDER_ID,
                data={
                    "symbol": td_symbol,
                    "exchange": meta.get("exchange") or "NSE",
                    "interval": interval,
                    "candles": candles,
                    "disclaimer": (
                        "END OF DAY / DELAYED research data via Twelve Data. "
                        "Not live exchange quotes; not for order execution."
                    ),
                },
                instrument=td_symbol,
                currency=meta.get("currency") or "INR",
                unit=f"OHLCV ({interval})",
                observation_time=most_recent_dt,
                freshness="END_OF_DAY",
                status="ok",
                source_url="https://twelvedata.com/docs#time-series",
            )

        return self._cached_coalesced_fetch(cache_key, _fetch, skip_cache=skip_cache)

    def get_quote(self, symbol: str, skip_cache: bool = False) -> ProviderResponse:
        """Fetch EOD/delayed quote when plan permits. Never labeled LIVE."""
        gate = self._check_entitlement(symbol)
        if gate is not None:
            return gate

        clean = symbol.strip().upper().replace(".NS", "").replace(":NSE", "")
        td_symbol = f"{clean}:NSE" if ":" not in symbol else symbol.strip().upper()
        cache_key = f"quote:{td_symbol}"

        def _fetch() -> ProviderResponse:
            params = {"symbol": td_symbol, "apikey": self._api_key}
            try:
                raw = self._make_request(f"{BASE_URL}/quote", params=params, credit_weight=1)
            except QuotaExhaustedError as exc:
                return make_unavailable(
                    PROVIDER_ID, str(exc), status="quota_exhausted", instrument=td_symbol
                )
            except Exception as exc:
                safe_err = redact_secrets(str(exc), self._secrets_to_redact())
                return make_unavailable(
                    PROVIDER_ID, f"Request failed: {safe_err}", instrument=td_symbol
                )

            if _is_td_error(raw):
                code = raw.get("code", 0)
                msg = redact_secrets(
                    str(raw.get("message", "Unknown error")), self._secrets_to_redact()
                )
                if code == 429:
                    self.mark_quota_exhausted()
                    return make_unavailable(
                        PROVIDER_ID,
                        f"Twelve Data quota exhausted: {msg}",
                        status="quota_exhausted",
                        instrument=td_symbol,
                    )
                return make_unavailable(
                    PROVIDER_ID,
                    f"TwelveData error {code}: {msg}",
                    status="error",
                    instrument=td_symbol,
                )

            obs_time = raw.get("datetime") or None
            price_val = float(raw["close"]) if raw.get("close") is not None else None
            if price_val is None or obs_time is None:
                return make_unavailable(
                    PROVIDER_ID,
                    f"Incomplete quote or missing timestamp for {td_symbol}.",
                    instrument=td_symbol,
                )

            return ProviderResponse(
                provider_id=PROVIDER_ID,
                source=PROVIDER_ID,
                data={
                    "symbol": td_symbol,
                    "name": raw.get("name"),
                    "price": price_val,
                    "open": float(raw["open"]) if raw.get("open") is not None else None,
                    "high": float(raw["high"]) if raw.get("high") is not None else None,
                    "low": float(raw["low"]) if raw.get("low") is not None else None,
                    "volume": raw.get("volume"),
                    "disclaimer": "END OF DAY — Not a live NSE trading quote.",
                },
                instrument=td_symbol,
                currency=raw.get("currency") or "INR",
                unit="Price",
                observation_time=obs_time,
                freshness="END_OF_DAY",
                status="ok",
                source_url="https://twelvedata.com/docs#quote",
            )

        return self._cached_coalesced_fetch(
            cache_key, _fetch, ttl_override=300, skip_cache=skip_cache
        )

    def fetch(self, **kwargs) -> ProviderResponse:
        symbol = kwargs.get("symbol")
        if symbol:
            return self.get_time_series(symbol)
        return make_unavailable(PROVIDER_ID, "No symbol provided.")


twelve_data = TwelveDataAdapter()

