"""
Stocks & Market Stream API Router.

Security & Reliability:
- Broker access tokens are NEVER accepted via query params (`kite_token` removed).
- Authenticated users resolve server-side encrypted Kite credentials from DB (`user_id` via JWT).
- `/stream` connects to live Kite WebSocket ticks when enabled & entitled, with delayed fallback
  and clean unsubscribe on disconnect/navigation.
- Demo fixtures are strictly gated behind explicit `settings.demo_mode == True`.
"""

import asyncio
from datetime import datetime, timezone
import json
import logging
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ai_models.prediction_engine import PredictionEngine
from auth.security import get_optional_user, get_stream_user
from config import settings
from data.demo_stocks import NIFTY50_STOCKS
from db.session import get_db
from services.backtest_service import BacktestEngine
from services.broker_service import mark_user_kite_token_expired, resolve_user_kite_credentials
from services.kite_ws_collector import kite_ws_collector
from services.market_data_service import MarketHours, market_data_service

logger = logging.getLogger("api.stocks")

router = APIRouter()
prediction_engine = PredictionEngine()


@router.get("/search")
async def search_stocks(q: str = ""):
    """Search NSE stock universe metadata (catalog only, no fabricated prices)."""
    q_upper = q.strip().upper()
    results = []
    for symbol, data in NIFTY50_STOCKS.items():
        if not q_upper or q_upper in symbol or q_upper in data.get("name", "").upper():
            results.append({
                "symbol": symbol,
                "name": data.get("name", symbol),
                "sector": data.get("sector"),
                "exchange": "NSE",
            })
    return results


@router.get("/list")
async def list_stocks():
    """List supported NIFTY 50 symbols with catalog metadata only (no demo prices in prod paths)."""
    items = []
    for symbol, data in NIFTY50_STOCKS.items():
        if settings.demo_mode:
            items.append({
                **data,
                "symbol": symbol,
                "exchange": "NSE",
                "source": "demo_fixture",
                "freshness": "DEMO",
                "demo": True,
            })
        else:
            items.append({
                "symbol": symbol,
                "name": data.get("name", symbol),
                "sector": data.get("sector"),
                "exchange": "NSE",
            })
    return items


@router.get("/stream")
async def stream_prices(
    request: Request,
    symbols: str = Query("RELIANCE,TCS,HDFCBANK,INFY,ICICIBANK"),
    exchange: str = Query("NSE"),
    user_id: str = Depends(get_stream_user),
    db: Session = Depends(get_db),
):
    """
    Server-Sent Events (SSE) endpoint streaming per-user authorized quotes.
    Uses live Kite WebSocket ticks when `kite_ws_enabled` and user has active Kite credentials;
    falls back cleanly to server-side delayed quotes without query-string token leakage.
    """
    ex_upper = exchange.strip().upper()
    if ex_upper not in ("NSE", "BSE"):
        raise HTTPException(status_code=400, detail=f"Unsupported exchange '{exchange}'.")

    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()][:20]
    creds = resolve_user_kite_credentials(user_id, db)

    if creds and settings.kite_ws_enabled:
        try:
            await kite_ws_collector.instruments.refresh_from_kite_csv()
        except Exception as exc:
            logger.debug("Kite instrument CSV preload skipped: %s", exc)
        tokens = [
            tok
            for sym in symbol_list
            if (tok := kite_ws_collector.instruments.get_token(sym, exchange=ex_upper)) is not None
        ]
        if tokens:
            await kite_ws_collector.start_user_collector(
                user_id=user_id,
                api_key=creds.api_key,
                access_token=creds.access_token,
                tokens=tokens,
                on_token_expired=lambda uid: mark_user_kite_token_expired(uid, db),
            )

    async def event_generator():
        ws_queue = kite_ws_collector.subscribe_stream(user_id)
        try:
            # 1. Emit immediate initial snapshot
            initial_quotes = await asyncio.to_thread(
                market_data_service.get_watchlist_quotes,
                symbol_list,
                None,
                user_id,
                ex_upper,
                db,
            )
            yield f"data: {json.dumps(initial_quotes)}\n\n"

            while True:
                if await request.is_disconnected():
                    break

                try:
                    tick = await asyncio.wait_for(ws_queue.get(), timeout=5.0)
                    tick_sym = str(tick.get("symbol", "")).upper()
                    if tick_sym in symbol_list:
                        payload = {
                            tick_sym: {
                                **tick,
                                "freshness": MarketHours.calculate_freshness(
                                    as_of=tick.get("as_of"),
                                    is_realtime=True,
                                ),
                                "market_session": MarketHours.get_market_session(),
                                "connection_status": kite_ws_collector.get_connection_state(user_id),
                                "status": "ok",
                            }
                        }
                        yield f"data: {json.dumps(payload)}\n\n"
                except asyncio.TimeoutError:
                    quotes = await asyncio.to_thread(
                        market_data_service.get_watchlist_quotes,
                        symbol_list,
                        None,
                        user_id,
                        ex_upper,
                        db,
                    )
                    yield f"data: {json.dumps(quotes)}\n\n"
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.error("[stream] SSE stream terminated for user=%s: %s", user_id, exc)
        finally:
            kite_ws_collector.unsubscribe_stream(user_id, ws_queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/backtest")
def run_backtest(
    symbol: str = Query("RELIANCE", description="NSE symbol to backtest"),
    years: int = Query(3, ge=1, le=10, description="Backtesting duration in years"),
    initial_capital: float = Query(100000.0, ge=10000.0, description="Starting capital in INR"),
):
    """
    Backtest deterministic quantitative rules (v1.0-deterministic-quant) on historical daily NSE data.
    """
    engine = BacktestEngine(symbol=symbol, years=years, initial_capital=initial_capital)
    result = engine.run()
    if result.get("status") == "unavailable":
        raise HTTPException(status_code=503, detail=result)
    return result


@router.get("/quote/{symbol}")
async def get_stock_quote(
    symbol: str,
    exchange: str = Query("NSE"),
    user_id: Optional[str] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """Fetch quote resolving verified user's server-side Kite connection when logged in."""
    return await asyncio.to_thread(
        market_data_service.get_quote,
        symbol,
        False,
        None,
        user_id,
        exchange,
        db,
    )


@router.get("/{symbol}")
async def get_stock_analysis(
    symbol: str,
    exchange: str = Query("NSE"),
    user_id: Optional[str] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """Detailed stock analysis with deterministic quantitative indicators & real or unavailable state."""
    clean = symbol.strip().upper()
    ex_upper = exchange.strip().upper()
    catalog_meta = NIFTY50_STOCKS.get(clean, {})

    quote = await asyncio.to_thread(
        market_data_service.get_quote, clean, False, None, user_id, ex_upper, db
    )
    candles = await asyncio.to_thread(
        market_data_service.get_ohlcv, clean, "1Y", False, ex_upper
    )

    if quote.get("status") != "unavailable" and quote.get("price"):
        stock_data = {
            "symbol": clean,
            "name": quote.get("name") or catalog_meta.get("name", clean),
            "sector": quote.get("sector") or catalog_meta.get("sector", "Equity"),
            "exchange": quote.get("exchange", ex_upper),
            "price": quote["price"],
            "change": quote.get("change"),
            "change_percent": quote.get("change_percent"),
            "open": quote.get("open"),
            "high": quote.get("high"),
            "low": quote.get("low"),
            "volume": quote.get("volume"),
            "week52_high": quote.get("week52_high"),
            "week52_low": quote.get("week52_low"),
            "upper_circuit_limit": quote.get("upper_circuit_limit"),
            "lower_circuit_limit": quote.get("lower_circuit_limit"),
            "pe_ratio": quote.get("pe_ratio"),
            "pb_ratio": quote.get("pb_ratio"),
            "market_cap": quote.get("market_cap"),
            "source": quote.get("source"),
            "freshness": quote.get("freshness"),
            "as_of": quote.get("as_of"),
            "exchange_timestamp": quote.get("exchange_timestamp"),
            "received_at": quote.get("received_at"),
            "price_age_seconds": quote.get("price_age_seconds"),
            "market_session": quote.get("market_session"),
            "connection_status": quote.get("connection_status"),
            "status": "ok",
        }
    elif settings.demo_mode and clean in NIFTY50_STOCKS:
        demo_row = NIFTY50_STOCKS[clean]
        stock_data = {
            **demo_row,
            "symbol": clean,
            "exchange": ex_upper,
            "source": "demo_fixture",
            "freshness": "DEMO",
            "demo": True,
            "as_of": datetime.now(timezone.utc).isoformat(),
            "status": "demo",
        }
    else:
        return {
            "symbol": clean,
            "name": catalog_meta.get("name", clean),
            "sector": catalog_meta.get("sector"),
            "exchange": ex_upper,
            "price": None,
            "status": "unavailable",
            "freshness": "UNAVAILABLE",
            "source": quote.get("source", "unavailable"),
            "as_of": quote.get("as_of"),
            "received_at": quote.get("received_at"),
            "market_session": quote.get("market_session"),
            "reason": quote.get(
                "reason",
                f"Live and delayed market data for '{clean}' ({ex_upper}) are unavailable.",
            ),
            "technicals": {
                "status": "unavailable",
                "reason": "Historical OHLCV unavailable.",
            },
            "ai_prediction": {
                "status": "unavailable",
                "reason": "Cannot issue signal without verified market data.",
                "disclaimer": "Not investment advice.",
            },
        }

    # Compute deterministic technicals only from actual OHLCV candles
    tech = await asyncio.to_thread(
        prediction_engine.compute_technicals_from_ohlcv, candles, stock_data["price"]
    )
    if tech.get("status") == "unavailable":
        stock_data["technicals"] = tech
        stock_data["ai_prediction"] = {
            "status": "unavailable",
            "reason": tech.get("reason", "Insufficient historical bars for signal calculation."),
            "disclaimer": "Deterministic analysis unavailable; not investment advice.",
        }
    else:
        stock_data["technicals"] = tech
        stock_data["ai_prediction"] = prediction_engine.analyze(clean, tech)
        stock_data["ai_prediction"]["source"] = stock_data.get("source")
        stock_data["ai_prediction"]["as_of"] = stock_data.get("as_of")
        stock_data["ai_prediction"]["freshness"] = stock_data.get("freshness")

    return stock_data


@router.get("/{symbol}/chart")
async def get_chart_data(
    symbol: str,
    period: str = "1Y",
    exchange: str = Query("NSE"),
):
    """Get real OHLCV chart data or explicit unavailable error."""
    clean = symbol.strip().upper()
    ex_upper = exchange.strip().upper()
    data = await asyncio.to_thread(market_data_service.get_ohlcv, clean, period, False, ex_upper)
    if not data:
        raise HTTPException(
            status_code=503,
            detail={
                "status": "unavailable",
                "symbol": clean,
                "exchange": ex_upper,
                "reason": f"Historical OHLCV unavailable for {clean} ({ex_upper}).",
            },
        )
    if isinstance(data[0], dict) and data[0].get("status") == "unavailable":
        raise HTTPException(status_code=503, detail=data[0])
    return data


@router.get("/{symbol}/ai-picks")
async def get_ai_picks(
    symbol: str = "",
    exchange: str = Query("NSE"),
    user_id: Optional[str] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """
    Compute deterministic rules-based stock picks ONLY from verified real quotes & OHLCV.
    Never invents prices, signals, targets, or confidence when data is unavailable.
    """
    ex_upper = exchange.strip().upper()
    target_symbols = list(NIFTY50_STOCKS.keys())[:8]

    async def _evaluate_pick(sym: str) -> Dict[str, object]:
        quote = await asyncio.to_thread(
            market_data_service.get_quote, sym, False, None, user_id, ex_upper, db
        )
        if quote.get("status") == "unavailable" or not quote.get("price"):
            return {
                "symbol": sym,
                "name": NIFTY50_STOCKS.get(sym, {}).get("name", sym),
                "exchange": ex_upper,
                "status": "unavailable",
                "freshness": "UNAVAILABLE",
                "source": quote.get("source", "unavailable"),
                "as_of": quote.get("as_of"),
                "reason": quote.get("reason", "Market quote unavailable."),
                "disclaimer": "Not investment advice.",
            }

        candles = await asyncio.to_thread(
            market_data_service.get_ohlcv, sym, "1Y", False, ex_upper
        )
        tech = await asyncio.to_thread(
            prediction_engine.compute_technicals_from_ohlcv, candles, quote["price"]
        )
        if tech.get("status") == "unavailable":
            return {
                "symbol": sym,
                "name": quote.get("name") or NIFTY50_STOCKS.get(sym, {}).get("name", sym),
                "exchange": ex_upper,
                "price": quote["price"],
                "change_pct": quote.get("change_percent"),
                "status": "unavailable",
                "freshness": quote.get("freshness", "UNAVAILABLE"),
                "source": quote.get("source"),
                "as_of": quote.get("as_of"),
                "reason": tech.get("reason", "Insufficient OHLCV history."),
                "disclaimer": "Not investment advice.",
            }

        pred = prediction_engine.analyze(sym, tech)
        return {
            "symbol": sym,
            "name": quote.get("name") or NIFTY50_STOCKS.get(sym, {}).get("name", sym),
            "exchange": ex_upper,
            "price": quote["price"],
            "change_pct": quote.get("change_percent"),
            "signal": pred.get("signal"),
            "confidence": pred.get("confidence"),
            "target": pred.get("target_price"),
            "stop_loss": pred.get("stop_loss"),
            "rule_version": pred.get("rule_version"),
            "rationale": pred.get("rationale"),
            "status": "ok",
            "source": quote.get("source"),
            "freshness": quote.get("freshness"),
            "as_of": quote.get("as_of"),
            "disclaimer": "Deterministic quantitative rules only. Not investment advice.",
        }

    picks = await asyncio.gather(*(_evaluate_pick(s) for s in target_symbols))
    return list(picks)
