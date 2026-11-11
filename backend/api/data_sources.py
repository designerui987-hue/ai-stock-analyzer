"""
Data Sources API Router (Authenticated & Rate-Limited).

Supplemental research endpoints powered by verified free/key-gated public APIs:
- Frankfurter (ECB reference FX rates — NOT executable FX prices)
- World Bank (India macro indicators — annual/quarterly, NOT intraday)
- MFapi (optional Indian mutual fund search & historical NAV — not on critical trading path)
- Alpha Vantage / Twelve Data (optional EOD research, strictly plan/exchange/symbol gated)
- GNews (development-only news search, disabled outside explicit APP_ENV=development)

Security & Reliability:
- Every route requires a verified JWT user (`get_current_user`).
- Upstream-calling routes enforce caller-level Redis/in-memory rate limiting.
- All endpoints are fully non-blocking async; slow research calls never stall quotes or /health.
- Exchange (`NSE` vs `BSE`) is validated and propagated explicitly without silent cross-fallback.
"""

import asyncio
from datetime import datetime, timezone
import logging
import threading
from typing import Dict, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query, status

from auth.security import get_current_user
from config import get_settings
from services.external_providers.alpha_vantage_adapter import alpha_vantage
from services.external_providers.base import make_unavailable
from services.external_providers.capability_registry import registry
from services.external_providers.frankfurter_adapter import frankfurter
from services.external_providers.gnews_adapter import gnews
from services.external_providers.mfapi_adapter import mfapi
from services.external_providers.twelve_data_adapter import twelve_data
from services.external_providers.worldbank_adapter import worldbank
from services.market_data_service import market_data_service

logger = logging.getLogger("api.data_sources")

router = APIRouter(dependencies=[Depends(get_current_user)])

# Process-local fallback window counter when Redis is unavailable: {user_id: (minute_bucket, count)}
_LOCAL_USER_LIMITS: Dict[str, Tuple[str, int]] = {}
_LOCAL_LIMIT_LOCK = threading.Lock()
_SUPPORTED_RESEARCH_EXCHANGES = frozenset({"NSE", "BSE"})


async def enforce_research_rate_limit(
    user_id: str = Depends(get_current_user),
) -> str:
    """
    Caller-level per-minute rate limit to protect shared upstream provider quotas.
    Uses shared Redis when available, safely degrading to process-local bounded counter.
    """
    cfg = get_settings()
    limit = max(1, int(cfg.research_rate_limit_per_minute))
    now_utc = datetime.now(timezone.utc)
    minute_bucket = now_utc.strftime("%Y%m%d%H%M")
    retry_after = max(1, 60 - now_utc.second)

    redis_client = getattr(market_data_service.cache, "_redis", None)
    if redis_client is not None:
        key = f"ext:user_ratelimit:{user_id}:{minute_bucket}"
        try:
            def _incr() -> int:
                val = int(redis_client.incr(key))
                if val == 1 and hasattr(redis_client, "expire"):
                    redis_client.expire(key, 120)
                return val

            current_count = await asyncio.to_thread(_incr)
            if current_count > limit:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=(
                        f"Research API caller rate limit exceeded ({limit} requests/minute). "
                        f"Retry in {retry_after}s."
                    ),
                    headers={"Retry-After": str(retry_after)},
                )
            return user_id
        except HTTPException:
            raise
        except Exception as exc:
            logger.warning("Redis caller rate limit check failed (%s); falling back locally.", exc)

    with _LOCAL_LIMIT_LOCK:
        prev = _LOCAL_USER_LIMITS.get(user_id)
        if prev and prev[0] == minute_bucket:
            count = prev[1] + 1
        else:
            count = 1
        # Keep dict bounded if many unique users hit fallback
        if len(_LOCAL_USER_LIMITS) > 2048:
            _LOCAL_USER_LIMITS.clear()
        _LOCAL_USER_LIMITS[user_id] = (minute_bucket, count)

    if count > limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Research API caller rate limit exceeded ({limit} requests/minute). "
                f"Retry in {retry_after}s."
            ),
            headers={"Retry-After": str(retry_after)},
        )
    return user_id


@router.get("/status")
async def get_provider_status(user_id: str = Depends(get_current_user)):
    """Return capabilities, health, estimated quota, and disabled reasons for all providers."""
    return {
        "providers": registry.get_status(),
        "requested_by": user_id,
        "disclaimer": (
            "Supplemental research providers only. None supply live NSE execution quotes. "
            "Not investment advice."
        ),
    }


@router.get("/fx/usd-inr")
async def get_usd_inr(_user_id: str = Depends(enforce_research_rate_limit)):
    """Latest USD/INR ECB reference rate from Frankfurter."""
    return (await frankfurter.get_usd_inr_rate()).to_dict()


@router.get("/fx/basket")
async def get_fx_basket(_user_id: str = Depends(enforce_research_rate_limit)):
    """USD, EUR, GBP, JPY to INR ECB reference rates from Frankfurter."""
    return (await frankfurter.get_inr_basket()).to_dict()


@router.get("/fx/history")
async def get_fx_history(
    from_currency: str = Query("USD"),
    to_currency: str = Query("INR"),
    days: int = Query(30, ge=1, le=365),
    _user_id: str = Depends(enforce_research_rate_limit),
):
    """Historical ECB reference rates for context."""
    return (
        await frankfurter.get_historical_rates(from_currency, to_currency, days=days)
    ).to_dict()


@router.get("/fx/{from_currency}/{to_currency}")
async def get_fx_rate(
    from_currency: str,
    to_currency: str,
    _user_id: str = Depends(enforce_research_rate_limit),
):
    """ECB reference rate between two ISO currencies."""
    return (await frankfurter.get_rate(from_currency, to_currency)).to_dict()


@router.get("/macro/india")
async def get_india_macro(_user_id: str = Depends(enforce_research_rate_limit)):
    """India macroeconomic summary from World Bank Open Data (annual/revised)."""
    return (await worldbank.get_india_macro_summary()).to_dict()


@router.get("/macro/indicator/{code}")
async def get_wb_indicator(
    code: str,
    _user_id: str = Depends(enforce_research_rate_limit),
):
    """Single World Bank macroeconomic indicator for India."""
    return (await worldbank.get_indicator(code)).to_dict()


@router.get("/mf/search")
async def search_mf_schemes(
    q: str = Query(..., min_length=2),
    _user_id: str = Depends(enforce_research_rate_limit),
):
    """Search Indian mutual fund schemes by name (AMFI via MFapi.in)."""
    return (await mfapi.search_schemes(q)).to_dict()


@router.get("/mf/{scheme_code}/latest")
async def get_mf_latest_nav(
    scheme_code: int,
    _user_id: str = Depends(enforce_research_rate_limit),
):
    """Latest NAV for a mutual fund scheme with explicit NAV date."""
    return (await mfapi.get_latest_nav(scheme_code)).to_dict()


@router.get("/mf/{scheme_code}")
async def get_mf_nav_history(
    scheme_code: int,
    days: int = Query(90, ge=1, le=365),
    _user_id: str = Depends(enforce_research_rate_limit),
):
    """Historical NAV series for a mutual fund scheme."""
    return (await mfapi.get_nav_history(scheme_code, days=days)).to_dict()


@router.get("/research/quote/{symbol}")
async def get_research_quote(
    symbol: str,
    exchange: str = Query("NSE"),
    _user_id: str = Depends(enforce_research_rate_limit),
):
    """
    Optional EOD research endpoint.
    Strictly returns END_OF_DAY or UNAVAILABLE — NEVER live NSE quotes,
    and NEVER silently converts BSE <-> NSE.
    """
    ex_upper = exchange.strip().upper()
    if ex_upper not in _SUPPORTED_RESEARCH_EXCHANGES:
        return make_unavailable(
            "research",
            f"Unsupported exchange '{exchange}'. Allowed research exchanges: NSE, BSE.",
            instrument=symbol,
            exchange=ex_upper,
        ).to_dict()

    if ex_upper == "BSE":
        if alpha_vantage.is_configured:
            return (await alpha_vantage.get_daily_eod(symbol, exchange="BSE")).to_dict()
        if twelve_data.is_configured:
            return (await twelve_data.get_quote(symbol, exchange="BSE")).to_dict()
    else:
        # NSE request must NEVER silently fall back to BSE Alpha Vantage
        if twelve_data.is_configured:
            return (await twelve_data.get_quote(symbol, exchange="NSE")).to_dict()

    return make_unavailable(
        "research",
        f"No research equity provider configured or permitted for {ex_upper} symbol '{symbol}'.",
        instrument=symbol,
        exchange=ex_upper,
    ).to_dict()


@router.get("/research/time-series/{symbol}")
async def get_research_time_series(
    symbol: str,
    interval: str = Query("1day"),
    days: int = Query(30, ge=1, le=100),
    exchange: str = Query("NSE"),
    adjusted: bool = Query(False),
    _user_id: str = Depends(enforce_research_rate_limit),
):
    """Optional EOD time series for research only (strictly exchange-scoped)."""
    ex_upper = exchange.strip().upper()
    if ex_upper not in _SUPPORTED_RESEARCH_EXCHANGES:
        return make_unavailable(
            "research",
            f"Unsupported exchange '{exchange}'. Allowed research exchanges: NSE, BSE.",
            instrument=symbol,
            exchange=ex_upper,
        ).to_dict()

    if ex_upper == "BSE":
        if alpha_vantage.is_configured:
            if adjusted:
                return (await alpha_vantage.get_daily_adjusted(symbol, exchange="BSE")).to_dict()
            return (await alpha_vantage.get_daily_eod(symbol, exchange="BSE")).to_dict()
        if twelve_data.is_configured:
            return (
                await twelve_data.get_time_series(
                    symbol, interval=interval, outputsize=days, exchange="BSE"
                )
            ).to_dict()
    else:
        if twelve_data.is_configured:
            return (
                await twelve_data.get_time_series(
                    symbol, interval=interval, outputsize=days, exchange="NSE"
                )
            ).to_dict()

    return make_unavailable(
        "research",
        f"No research time-series provider configured or permitted for {ex_upper} symbol '{symbol}'.",
        instrument=symbol,
        exchange=ex_upper,
    ).to_dict()


@router.get("/news/search")
async def search_news(
    q: str = Query(..., min_length=2),
    _user_id: str = Depends(enforce_research_rate_limit),
):
    """
    Development-only India news search via GNews.
    Disabled outside explicit APP_ENV=development; never triggers trading entries.
    """
    return (await gnews.search_news(q)).to_dict()
