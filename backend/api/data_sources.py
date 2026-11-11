"""
Data Sources API Router.

Supplemental research endpoints powered by verified free/key-gated public APIs:
- Frankfurter (ECB reference FX rates — NOT executable FX prices)
- World Bank (India macro indicators — annual/quarterly, NOT intraday)
- MFapi (optional Indian mutual fund search & historical NAV — not on critical trading path)
- Alpha Vantage / Twelve Data (optional EOD research, strictly plan/symbol gated)
- GNews (development-only news search, disabled in production)

IMPORTANT:
None of these endpoints feed the live NSE signal or order-execution path.
"""

from fastapi import APIRouter, Query

from services.external_providers.alpha_vantage_adapter import alpha_vantage
from services.external_providers.base import make_unavailable
from services.external_providers.capability_registry import registry
from services.external_providers.frankfurter_adapter import frankfurter
from services.external_providers.gnews_adapter import gnews
from services.external_providers.mfapi_adapter import mfapi
from services.external_providers.twelve_data_adapter import twelve_data
from services.external_providers.worldbank_adapter import worldbank

router = APIRouter()


@router.get("/status")
async def get_provider_status():
    """Return capabilities, health, estimated quota, and disabled reasons for all providers."""
    return {
        "providers": registry.get_status(),
        "disclaimer": (
            "Supplemental research providers only. None supply live NSE execution quotes. "
            "Not investment advice."
        ),
    }


@router.get("/fx/usd-inr")
async def get_usd_inr():
    """Latest USD/INR ECB reference rate from Frankfurter."""
    return frankfurter.get_usd_inr_rate().to_dict()


@router.get("/fx/basket")
async def get_fx_basket():
    """USD, EUR, GBP, JPY to INR ECB reference rates from Frankfurter."""
    return frankfurter.get_inr_basket().to_dict()


@router.get("/fx/history")
async def get_fx_history(
    from_currency: str = Query("USD"),
    to_currency: str = Query("INR"),
    days: int = Query(30, ge=1, le=365),
):
    """Historical ECB reference rates for context."""
    return frankfurter.get_historical_rates(from_currency, to_currency, days=days).to_dict()


@router.get("/fx/{from_currency}/{to_currency}")
async def get_fx_rate(from_currency: str, to_currency: str):
    """ECB reference rate between two ISO currencies."""
    return frankfurter.get_rate(from_currency, to_currency).to_dict()


@router.get("/macro/india")
async def get_india_macro():
    """India macroeconomic summary from World Bank Open Data (annual/revised)."""
    return worldbank.get_india_macro_summary().to_dict()


@router.get("/macro/indicator/{code}")
async def get_wb_indicator(code: str):
    """Single World Bank macroeconomic indicator for India."""
    return worldbank.get_indicator(code).to_dict()


@router.get("/mf/search")
async def search_mf_schemes(q: str = Query(..., min_length=2)):
    """Search Indian mutual fund schemes by name (AMFI via MFapi.in)."""
    return mfapi.search_schemes(q).to_dict()


@router.get("/mf/{scheme_code}/latest")
async def get_mf_latest_nav(scheme_code: int):
    """Latest NAV for a mutual fund scheme with explicit NAV date."""
    return mfapi.get_latest_nav(scheme_code).to_dict()


@router.get("/mf/{scheme_code}")
async def get_mf_nav_history(
    scheme_code: int,
    days: int = Query(90, ge=1, le=365),
):
    """Historical NAV series for a mutual fund scheme."""
    return mfapi.get_nav_history(scheme_code, days=days).to_dict()


@router.get("/research/quote/{symbol}")
async def get_research_quote(symbol: str, exchange: str = Query("NSE")):
    """
    Optional EOD research endpoint.
    Strictly returns END_OF_DAY or UNAVAILABLE — NEVER live NSE quotes.
    """
    if exchange.strip().upper() == "BSE" and alpha_vantage.is_configured:
        return alpha_vantage.get_daily_eod(symbol, exchange="BSE").to_dict()
    if twelve_data.is_configured:
        return twelve_data.get_quote(symbol).to_dict()
    if alpha_vantage.is_configured:
        return alpha_vantage.get_daily_eod(symbol, exchange=exchange).to_dict()

    return make_unavailable(
        "research",
        "No research equity provider configured or permitted for this symbol/plan.",
        instrument=symbol,
    ).to_dict()


@router.get("/research/time-series/{symbol}")
async def get_research_time_series(
    symbol: str,
    interval: str = Query("1day"),
    days: int = Query(30, ge=1, le=100),
    exchange: str = Query("NSE"),
):
    """Optional EOD time series for research only."""
    if exchange.strip().upper() == "BSE" and alpha_vantage.is_configured:
        return alpha_vantage.get_daily_eod(symbol, exchange="BSE").to_dict()
    if twelve_data.is_configured:
        return twelve_data.get_time_series(symbol, interval=interval, outputsize=days).to_dict()
    if alpha_vantage.is_configured:
        return alpha_vantage.get_daily_eod(symbol, exchange=exchange).to_dict()

    return make_unavailable(
        "research",
        "No research time-series provider configured or permitted for this symbol/plan.",
        instrument=symbol,
    ).to_dict()


@router.get("/news/search")
async def search_news(q: str = Query(..., min_length=2)):
    """
    Development-only India news search via GNews.
    Disabled in production environments; never triggers trading entries.
    """
    return gnews.search_news(q).to_dict()

