"""
Market Overview API Router.

Hard rules enforced:
- No hardcoded index values (`fallback_val` removed).
- No fabricated market breadth (`34/16`), FII/DII numbers (`+647/+267 Cr`), or static `DEMO_NEWS`
  in normal user-facing paths; return explicit `unavailable` with timestamp & reason.
- Demo fixtures allowed ONLY when explicit `settings.demo_mode == True`.
"""

import asyncio
from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import APIRouter
import yfinance as yf

from config import settings
from data.demo_stocks import DEMO_NEWS, NIFTY50_STOCKS, SECTORS
from services.market_data_service import MarketHours, market_data_service

router = APIRouter()

INDEX_SPECS = [
    {"symbol": "^NSEI", "name": "NIFTY 50"},
    {"symbol": "^BSESN", "name": "SENSEX"},
    {"symbol": "^NSEBANK", "name": "BANK NIFTY"},
    {"symbol": "^INDIAVIX", "name": "INDIA VIX"},
]


def _fetch_live_indices_sync() -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    now_iso = datetime.now(timezone.utc).isoformat()
    for spec in INDEX_SPECS:
        try:
            ticker = yf.Ticker(spec["symbol"])
            info = ticker.info or {}
            price = info.get("regularMarketPrice") or info.get("currentPrice")
            prev = info.get("previousClose") or info.get("regularMarketPreviousClose")
            raw_mkt_time = info.get("regularMarketTime")
            obs_iso = (
                datetime.fromtimestamp(float(raw_mkt_time), tz=timezone.utc).isoformat()
                if isinstance(raw_mkt_time, (int, float))
                else None
            )

            if price is None or obs_iso is None:
                hist = ticker.history(period="5d", interval="1d")
                if not hist.empty:
                    if price is None:
                        price = float(hist.iloc[-1]["Close"])
                    if prev is None and len(hist) > 1:
                        prev = float(hist.iloc[-2]["Close"])
                    if obs_iso is None and hasattr(hist.index[-1], "to_pydatetime"):
                        dt_val = hist.index[-1].to_pydatetime()
                        if dt_val.tzinfo is None:
                            dt_val = dt_val.replace(tzinfo=timezone.utc)
                        obs_iso = dt_val.astimezone(timezone.utc).isoformat()

            if price and obs_iso:
                price_f = round(float(price), 2)
                prev_f = round(float(prev), 2) if prev else price_f
                chg = round(price_f - prev_f, 2)
                chg_pct = round((chg / prev_f) * 100.0, 2) if prev_f > 0 else 0.0
                results.append({
                    "name": spec["name"],
                    "symbol": spec["symbol"],
                    "value": price_f,
                    "change": chg,
                    "change_percent": chg_pct,
                    "source": "yfinance",
                    "freshness": MarketHours.calculate_freshness(as_of=obs_iso, is_realtime=False),
                    "as_of": obs_iso,
                    "received_at": now_iso,
                    "status": "ok",
                })
                continue
        except Exception:
            pass

        results.append({
            "name": spec["name"],
            "symbol": spec["symbol"],
            "value": None,
            "change": None,
            "change_percent": None,
            "source": "unavailable",
            "freshness": "UNAVAILABLE",
            "as_of": None,
            "received_at": now_iso,
            "status": "unavailable",
            "reason": "Index quote or observation timestamp unavailable.",
        })
    return results


def _fetch_constituent_quotes_sync() -> List[Dict[str, Any]]:
    symbols = list(NIFTY50_STOCKS.keys())[:10]
    quotes = market_data_service.get_watchlist_quotes(symbols)
    out: List[Dict[str, Any]] = []
    for sym, q in quotes.items():
        if q.get("status") != "unavailable" and q.get("price"):
            meta = NIFTY50_STOCKS.get(sym, {})
            out.append({
                "symbol": sym,
                "name": q.get("name") or meta.get("name", sym),
                "sector": q.get("sector") or meta.get("sector", "Equity"),
                "price": q["price"],
                "change": q.get("change"),
                "change_percent": q.get("change_percent"),
                "volume": q.get("volume"),
                "source": q.get("source"),
                "freshness": q.get("freshness"),
                "as_of": q.get("as_of"),
            })
    return out


@router.get("/overview")
async def market_overview():
    """Indian market overview with strict real/unavailable separation (never hardcoded values)."""
    now_iso = datetime.now(timezone.utc).isoformat()
    indices, constituents = await asyncio.gather(
        asyncio.to_thread(_fetch_live_indices_sync),
        asyncio.to_thread(_fetch_constituent_quotes_sync),
    )

    advances = sum(1 for c in constituents if (c.get("change_percent") or 0) > 0)
    declines = sum(1 for c in constituents if (c.get("change_percent") or 0) < 0)
    unchanged = max(0, len(constituents) - advances - declines)

    breadth = (
        {
            "advances": advances,
            "declines": declines,
            "unchanged": unchanged,
            "sample_size": len(constituents),
            "status": "ok",
            "source": constituents[0].get("source", "yfinance"),
        }
        if constituents
        else {
            "advances": None,
            "declines": None,
            "unchanged": None,
            "sample_size": 0,
            "status": "unavailable",
            "reason": "Constituent quotes unavailable to compute market breadth.",
        }
    )

    if settings.demo_mode:
        fii_activity: Dict[str, Any] = {
            "buy_cr": 12450.0,
            "sell_cr": 11802.0,
            "net_cr": 647.82,
            "source": "demo_fixture",
            "demo": True,
        }
        dii_activity: Dict[str, Any] = {
            "buy_cr": 9820.0,
            "sell_cr": 9553.0,
            "net_cr": 267.45,
            "source": "demo_fixture",
            "demo": True,
        }
    else:
        unavailable_flow = {
            "buy_cr": None,
            "sell_cr": None,
            "net_cr": None,
            "status": "unavailable",
            "source": "unavailable",
            "as_of": None,
            "reason": "No verified NSE FII/DII institutional flow feed configured.",
        }
        fii_activity = unavailable_flow
        dii_activity = dict(unavailable_flow)

    return {
        "indices": indices,
        "advance_decline": breadth,
        "fii_activity": fii_activity,
        "dii_activity": dii_activity,
        "market_session": MarketHours.get_market_session(),
        "is_market_open": MarketHours.is_market_open(),
        "received_at": now_iso,
        "demo_mode": settings.demo_mode,
        "disclaimer": "Reference market data only. Not investment advice.",
    }


@router.get("/gainers")
async def top_gainers():
    stocks = await asyncio.to_thread(_fetch_constituent_quotes_sync)
    return sorted(stocks, key=lambda x: x.get("change_percent") or 0, reverse=True)[:5]


@router.get("/losers")
async def top_losers():
    stocks = await asyncio.to_thread(_fetch_constituent_quotes_sync)
    return sorted(stocks, key=lambda x: x.get("change_percent") or 0)[:5]


@router.get("/sectors")
async def sector_performance():
    if settings.demo_mode:
        return SECTORS
    stocks = await asyncio.to_thread(_fetch_constituent_quotes_sync)
    if not stocks:
        return []
    by_sector: Dict[str, List[float]] = {}
    for s in stocks:
        sec = s.get("sector") or "Other"
        if s.get("change_percent") is not None:
            by_sector.setdefault(sec, []).append(float(s["change_percent"]))
    return [
        {
            "sector": sec,
            "avg_change_percent": round(sum(vals) / len(vals), 2),
            "constituents": len(vals),
            "status": "ok",
        }
        for sec, vals in by_sector.items()
    ]


@router.get("/heatmap")
async def market_heatmap():
    stocks = await asyncio.to_thread(_fetch_constituent_quotes_sync)
    return [
        {
            "symbol": s["symbol"],
            "name": s["name"],
            "sector": s.get("sector", "Equity"),
            "change": s.get("change_percent"),
            "price": s["price"],
            "source": s.get("source"),
            "as_of": s.get("as_of"),
        }
        for s in stocks
    ]


@router.get("/news")
async def market_news():
    if settings.demo_mode:
        return [{"demo": True, **item} for item in DEMO_NEWS]
    return []
