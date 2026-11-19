"""
Research Snapshot and Comparison Service.

Responsibilities:
- Persist structured snapshots of verified quotes and quantitative technicals.
- Compare the latest valid snapshot with the previous comparable snapshot.
- Enforce strict snapshot compatibility: same symbol, exchange, methodology version, and strictly sequential timestamps.
- Never interpret missing values as zero or compare incompatible metrics.
- Rank and explain research items worth investigating using transparent, documented criteria.
- Produce personalized daily briefs combining watchlist changes, portfolio exposure, and transparent radar items.
"""

from datetime import datetime, timezone, timedelta
import logging
import math
from typing import Dict, List, Optional, Any, Union
from sqlalchemy.orm import Session
from sqlalchemy import desc, text, and_, or_

from db.models import ResearchSnapshot, WatchlistItem, Holding, Portfolio
from data.demo_stocks import NIFTY50_STOCKS
from services.portfolio_service import PortfolioService

logger = logging.getLogger("services.research_snapshot")

DEFAULT_METHODOLOGY_VERSION = "v1.0-deterministic-quant"
DEFAULT_TIMEFRAME = "1D"
DEFAULT_LOOKBACK_BARS = 250
DEFAULT_ADJUSTMENT_BASIS = "split_and_dividend_adjusted"
DEFAULT_SECTOR_CONCENTRATION_THRESHOLD = 35.0
MAX_SNAPSHOT_RETENTION_PER_SYMBOL = 30
MIN_SNAPSHOT_INTERVAL_SECONDS = 300  # 5 minutes minimum between snapshots with unchanged price


class ResearchSnapshotService:
    """Service for research snapshots, 'What Changed' comparison, and personalized radar."""

    @staticmethod
    def _parse_datetime(val: Any) -> Optional[datetime]:
        """
        Parse datetime object or ISO string to timezone-aware UTC datetime.
        Returns None if missing or malformed; NEVER silently falls back to current time.
        """
        if val is None:
            return None
        if isinstance(val, datetime):
            if val.tzinfo is None:
                return val.replace(tzinfo=timezone.utc)
            return val.astimezone(timezone.utc)
        if isinstance(val, str) and val.strip():
            try:
                dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    return dt.replace(tzinfo=timezone.utc)
                return dt.astimezone(timezone.utc)
            except Exception:
                return None
        return None

    @staticmethod
    def record_snapshot(
        db: Session,
        symbol: str,
        quote_data: dict,
        technicals: Optional[dict] = None,
        ai_prediction: Optional[dict] = None,
        exchange: str = "NSE",
        user_id: Optional[Union[int, str]] = None,
        rule_version: str = DEFAULT_METHODOLOGY_VERSION,
        timeframe: Optional[str] = None,
        lookback_bars: Optional[int] = None,
        adjustment_basis: Optional[str] = None,
    ) -> Optional[ResearchSnapshot]:
        """
        Record a validated quantitative snapshot to PostgreSQL/SQLite.
        Rejects invalid timestamps, stale quotes, non-finite numbers, and future timestamps.
        Preserves multi-session daily baselines independently from intraday tick noise.
        """
        clean_sym = symbol.strip().upper()
        clean_ex = exchange.strip().upper()
        price = quote_data.get("price")

        # 1. Validate that price is finite numeric and strictly positive
        if not isinstance(price, (int, float)) or not math.isfinite(price) or price <= 0:
            return None

        # 2. Reject stale or explicitly unavailable quotes
        freshness = str(quote_data.get("freshness") or "").upper()
        if freshness in ("STALE", "UNAVAILABLE") or quote_data.get("status") == "unavailable":
            return None

        # 3. Validate observation timestamp strictly (never fabricate from server receipt time)
        raw_as_of = quote_data.get("as_of") or quote_data.get("exchange_timestamp")
        as_of = ResearchSnapshotService._parse_datetime(raw_as_of)
        if as_of is None:
            return None

        tech = technicals or {}
        ai = ai_prediction or {}

        # Safely extract finite numeric technical values (None if missing/unavailable, NEVER 0.0 or inf/nan)
        def _get_float(d: dict, k: str) -> Optional[float]:
            v = d.get(k)
            if isinstance(v, (int, float)) and math.isfinite(v):
                return float(v)
            return None

        def _get_int(d: dict, k: str) -> Optional[int]:
            v = d.get(k)
            if isinstance(v, (int, float)) and math.isfinite(v):
                return int(v)
            return None

        rsi = _get_float(tech, "rsi")
        sma20 = _get_float(tech, "sma_20")
        sma50 = _get_float(tech, "sma_50")
        sma200 = _get_float(tech, "sma_200")
        macd = _get_float(tech, "macd")
        macd_signal = _get_float(tech, "macd_signal")
        vol_surge = _get_float(tech, "vol_surge") or _get_float(tech, "volume_ratio")
        volume = _get_int(quote_data, "volume")
        avg_volume_20d = _get_int(quote_data, "avg_volume") or _get_int(tech, "avg_volume_20d")

        signal = ai.get("signal")
        if signal not in ("BUY", "HOLD", "SELL"):
            signal = None

        tf = timeframe or tech.get("timeframe") or DEFAULT_TIMEFRAME
        lb = lookback_bars or tech.get("lookback_bars") or DEFAULT_LOOKBACK_BARS
        adj = adjustment_basis or tech.get("adjustment_basis") or quote_data.get("adjustment_basis") or DEFAULT_ADJUSTMENT_BASIS
        source = quote_data.get("source") or tech.get("source") or "yfinance/NSE"

        try:
            # 1. Exact observation timestamp deduplication
            existing = (
                db.query(ResearchSnapshot)
                .filter(
                    ResearchSnapshot.user_id == user_id,
                    ResearchSnapshot.symbol == clean_sym,
                    ResearchSnapshot.exchange == clean_ex,
                    ResearchSnapshot.as_of == as_of,
                )
                .first()
            )
            if existing:
                return existing

            # 2. Material-Content Deduplication:
            # If within 5 minutes, reuse the latest snapshot ONLY if all material indicators are unchanged.
            # If price changed >= 0.5%, or RSI shifted, or MA crossed, or signal changed -> record new snapshot!
            latest = (
                db.query(ResearchSnapshot)
                .filter(
                    ResearchSnapshot.user_id == user_id,
                    ResearchSnapshot.symbol == clean_sym,
                    ResearchSnapshot.exchange == clean_ex,
                )
                .order_by(desc(ResearchSnapshot.as_of))
                .first()
            )
            if latest:
                latest_as_of = ResearchSnapshotService._parse_datetime(latest.as_of)
                if latest_as_of:
                    time_diff = abs((as_of - latest_as_of).total_seconds())
                    if time_diff < MIN_SNAPSHOT_INTERVAL_SECONDS:
                        price_diff_pct = abs(float(price) - latest.price) / latest.price * 100.0
                        
                        # Material change checks
                        price_material = price_diff_pct >= 0.5
                        rsi_material = False
                        if rsi is not None and latest.rsi_14 is not None:
                            rsi_material = (
                                abs(rsi - latest.rsi_14) >= 5.0
                                or (rsi > 70) != (latest.rsi_14 > 70)
                                or (rsi < 30) != (latest.rsi_14 < 30)
                            )
                        elif (rsi is None) != (latest.rsi_14 is None):
                            rsi_material = True

                        ma_crossed = False
                        if sma20 is not None and latest.sma_20 is not None:
                            ma_crossed = (float(price) > sma20) != (latest.price > latest.sma_20)

                        signal_changed = signal != latest.signal

                        if not (price_material or rsi_material or ma_crossed or signal_changed):
                            # Invariant: No material change within deduplication window
                            return latest

            snapshot = ResearchSnapshot(
                user_id=user_id,
                symbol=clean_sym,
                exchange=clean_ex,
                as_of=as_of,
                price=float(price),
                open_price=_get_float(quote_data, "open"),
                high_price=_get_float(quote_data, "high"),
                low_price=_get_float(quote_data, "low"),
                volume=volume,
                avg_volume_20d=avg_volume_20d,
                rsi_14=rsi,
                sma_20=sma20,
                sma_50=sma50,
                sma_200=sma200,
                macd=macd,
                macd_signal=macd_signal,
                vol_surge=vol_surge,
                signal=signal,
                rule_version=rule_version,
                timeframe=tf,
                lookback_bars=lb,
                adjustment_basis=adj,
                source=source,
            )
            db.add(snapshot)
            db.commit()
            db.refresh(snapshot)

            # 3. Retention Scoped Pruning:
            # Keeps strictly up to MAX_SNAPSHOT_RETENTION_PER_SYMBOL (30) snapshots per user/symbol.
            all_snapshots = (
                db.query(ResearchSnapshot.id)
                .filter(
                    ResearchSnapshot.user_id == user_id,
                    ResearchSnapshot.symbol == clean_sym,
                    ResearchSnapshot.exchange == clean_ex,
                )
                .order_by(desc(ResearchSnapshot.as_of))
                .all()
            )

            if len(all_snapshots) > MAX_SNAPSHOT_RETENTION_PER_SYMBOL:
                surplus_ids = [s[0] for s in all_snapshots[MAX_SNAPSHOT_RETENTION_PER_SYMBOL:]]
                db.query(ResearchSnapshot).filter(ResearchSnapshot.id.in_(surplus_ids)).delete(synchronize_session=False)
                db.commit()

            return snapshot
        except Exception as exc:
            db.rollback()
            logger.warning("[ResearchSnapshotService] Error recording snapshot for %s: %s", clean_sym, exc)
            return None

    @staticmethod
    def compare_snapshots(curr: ResearchSnapshot, prev: ResearchSnapshot) -> dict:
        """
        Compare two verified snapshots and identify material changes.
        Enforces compatibility:
          - Same symbol and exchange.
          - Same methodology version.
          - curr.as_of strictly after prev.as_of.
          - Missing values are NEVER treated as zero.
        """
        if curr.symbol != prev.symbol or curr.exchange != prev.exchange:
            return {
                "status": "incompatible",
                "reason": "Cannot compare snapshots of different symbols or exchanges.",
            }

        if curr.rule_version != prev.rule_version:
            return {
                "status": "incompatible",
                "reason": f"Methodology version mismatch: {curr.rule_version} vs {prev.rule_version}.",
            }

        curr_tf = getattr(curr, "timeframe", DEFAULT_TIMEFRAME)
        prev_tf = getattr(prev, "timeframe", DEFAULT_TIMEFRAME)
        if curr_tf != prev_tf:
            return {
                "status": "incompatible",
                "reason": f"Timeframe mismatch: {curr_tf} vs {prev_tf}.",
            }

        curr_adj = getattr(curr, "adjustment_basis", DEFAULT_ADJUSTMENT_BASIS)
        prev_adj = getattr(prev, "adjustment_basis", DEFAULT_ADJUSTMENT_BASIS)
        if curr_adj != prev_adj:
            return {
                "status": "incompatible",
                "reason": f"Adjustment basis mismatch: {curr_adj} vs {prev_adj}.",
            }

        curr_lb = getattr(curr, "lookback_bars", DEFAULT_LOOKBACK_BARS)
        prev_lb = getattr(prev, "lookback_bars", DEFAULT_LOOKBACK_BARS)
        if curr_lb is not None and prev_lb is not None and curr_lb != prev_lb:
            return {
                "status": "incompatible",
                "reason": f"Lookback window mismatch: {curr_lb} bars vs {prev_lb} bars.",
            }

        curr_src = getattr(curr, "source", None)
        prev_src = getattr(prev, "source", None)
        source_note = None
        if curr_src and prev_src and curr_src != prev_src:
            source_note = f"Source transition: {prev_src} -> {curr_src}."

        curr_time = ResearchSnapshotService._parse_datetime(curr.as_of)
        prev_time = ResearchSnapshotService._parse_datetime(prev.as_of)

        if not curr_time or not prev_time:
            return {
                "status": "incompatible",
                "reason": "Missing or malformed observation timestamp.",
            }

        if curr_time < prev_time:
            return {
                "status": "incompatible",
                "reason": f"Out-of-order snapshots: current ({curr_time.isoformat()}) is earlier than baseline ({prev_time.isoformat()}).",
            }

        if curr_time == prev_time:
            return {
                "status": "identical_observation",
                "symbol": curr.symbol,
                "exchange": curr.exchange,
                "current_as_of": curr_time.isoformat(),
                "previous_as_of": prev_time.isoformat(),
                "comparison_period_hours": 0.0,
                "methodology_version": curr.rule_version,
                "changes_count": 0,
                "changes": [],
                "summary": "Observation timestamp matches comparison baseline; no new market events observed.",
            }

        if curr_time < prev_time:
            return {
                "status": "incompatible",
                "reason": "Current snapshot timestamp must be strictly later than previous snapshot.",
            }

        diff_seconds = (curr_time - prev_time).total_seconds()
        period_hours = diff_seconds / 3600.0

        changes: List[dict] = []

        # 1. Price Movement
        price_diff = curr.price - prev.price
        price_diff_pct = (price_diff / prev.price) * 100.0
        if abs(price_diff_pct) >= 0.05:  # Noticeable change threshold (>= 0.05%)
            direction = "up" if price_diff > 0 else "down"
            changes.append({
                "metric": "price",
                "type": "price_movement",
                "previous_value": round(prev.price, 2),
                "current_value": round(curr.price, 2),
                "change": round(price_diff, 2),
                "change_pct": round(price_diff_pct, 2),
                "direction": direction,
                "explanation": (
                    f"Price moved from ₹{prev.price:,.2f} to ₹{curr.price:,.2f} "
                    f"({price_diff_pct:+.2f}%) over the comparison window."
                ),
                "source": curr.source,
            })

        # 2. Moving Average Crossings (SMA 20, 50, 200)
        ma_configs = [
            ("sma_20", "20-day moving average", curr.sma_20, prev.sma_20),
            ("sma_50", "50-day moving average", curr.sma_50, prev.sma_50),
            ("sma_200", "200-day moving average", curr.sma_200, prev.sma_200),
        ]
        for key, label, curr_ma, prev_ma in ma_configs:
            if curr_ma is not None and prev_ma is not None:
                # Crossed above
                if prev.price <= prev_ma and curr.price > curr_ma:
                    changes.append({
                        "metric": key,
                        "type": "ma_crossover",
                        "direction": "bullish_cross",
                        "previous_value": round(prev_ma, 2),
                        "current_value": round(curr_ma, 2),
                        "explanation": f"Price crossed above the {label} (₹{curr_ma:,.2f}), confirming near-term trend improvement.",
                        "source": curr.source,
                    })
                # Crossed below
                elif prev.price >= prev_ma and curr.price < curr_ma:
                    changes.append({
                        "metric": key,
                        "type": "ma_crossover",
                        "direction": "bearish_cross",
                        "previous_value": round(prev_ma, 2),
                        "current_value": round(curr_ma, 2),
                        "explanation": f"Price slipped below the {label} (₹{curr_ma:,.2f}), indicating short-term momentum loss.",
                        "source": curr.source,
                    })

        # 3. Momentum Category Changes (RSI 14)
        if curr.rsi_14 is not None and prev.rsi_14 is not None:
            def _rsi_cat(val: float) -> str:
                if val > 70:
                    return "Overbought (> 70)"
                elif val < 30:
                    return "Oversold (< 30)"
                return "Neutral (30–70)"

            prev_cat = _rsi_cat(prev.rsi_14)
            curr_cat = _rsi_cat(curr.rsi_14)
            rsi_delta = curr.rsi_14 - prev.rsi_14

            if prev_cat != curr_cat:
                changes.append({
                    "metric": "rsi_14",
                    "type": "momentum_shift",
                    "previous_value": round(prev.rsi_14, 1),
                    "current_value": round(curr.rsi_14, 1),
                    "previous_category": prev_cat,
                    "current_category": curr_cat,
                    "direction": "momentum_expansion" if rsi_delta > 0 else "momentum_contraction",
                    "explanation": f"14-day RSI transitioned from {prev_cat} ({prev.rsi_14:.1f}) to {curr_cat} ({curr.rsi_14:.1f}).",
                    "source": curr.source,
                })
            elif abs(rsi_delta) >= 5.0:
                changes.append({
                    "metric": "rsi_14",
                    "type": "momentum_delta",
                    "previous_value": round(prev.rsi_14, 1),
                    "current_value": round(curr.rsi_14, 1),
                    "direction": "momentum_expansion" if rsi_delta > 0 else "momentum_contraction",
                    "explanation": f"14-day RSI shifted by {rsi_delta:+.1f} points (from {prev.rsi_14:.1f} to {curr.rsi_14:.1f}).",
                    "source": curr.source,
                })

        # 4. MACD Crossover
        if (
            curr.macd is not None
            and curr.macd_signal is not None
            and prev.macd is not None
            and prev.macd_signal is not None
        ):
            if prev.macd <= prev.macd_signal and curr.macd > curr.macd_signal:
                changes.append({
                    "metric": "macd",
                    "type": "macd_crossover",
                    "direction": "bullish_cross",
                    "previous_value": round(prev.macd, 2),
                    "current_value": round(curr.macd, 2),
                    "explanation": "MACD line crossed above the signal line (bullish momentum alignment).",
                    "source": curr.source,
                })
            elif prev.macd >= prev.macd_signal and curr.macd < curr.macd_signal:
                changes.append({
                    "metric": "macd",
                    "type": "macd_crossover",
                    "direction": "bearish_cross",
                    "previous_value": round(prev.macd, 2),
                    "current_value": round(curr.macd, 2),
                    "explanation": "MACD line crossed below the signal line (bearish momentum alignment).",
                    "source": curr.source,
                })

        # 5. Volume Surge
        if curr.vol_surge is not None:
            if curr.vol_surge >= 1.5 and (prev.vol_surge is None or prev.vol_surge < 1.5):
                changes.append({
                    "metric": "vol_surge",
                    "type": "volume_surge",
                    "previous_value": round(prev.vol_surge, 1) if prev.vol_surge else None,
                    "current_value": round(curr.vol_surge, 1),
                    "direction": "high_volume",
                    "explanation": f"Trading volume surged to {curr.vol_surge:.1f}x the 20-day average volume.",
                    "source": curr.source,
                })
            elif prev.vol_surge and abs(curr.vol_surge - prev.vol_surge) >= 0.5:
                changes.append({
                    "metric": "vol_surge",
                    "type": "volume_shift",
                    "previous_value": round(prev.vol_surge, 1),
                    "current_value": round(curr.vol_surge, 1),
                    "direction": "volume_expansion" if curr.vol_surge > prev.vol_surge else "volume_contraction",
                    "explanation": f"Volume ratio changed from {prev.vol_surge:.1f}x to {curr.vol_surge:.1f}x vs 20-day average.",
                    "source": curr.source,
                })

        # 6. Rule-Based Research Observation Change
        if curr.signal and prev.signal and curr.signal != prev.signal:
            changes.append({
                "metric": "signal",
                "type": "signal_flip",
                "previous_value": prev.signal,
                "current_value": curr.signal,
                "direction": "upgrade" if curr.signal == "BUY" or (prev.signal == "SELL" and curr.signal == "HOLD") else "downgrade",
                "explanation": f"Quantitative rule consensus shifted from {prev.signal} to {curr.signal}.",
                "source": curr.source,
            })

        # Plain language summary
        if not changes:
            summary_statement = "No material technical or price changes observed since the previous snapshot."
        else:
            top_explanations = [c["explanation"] for c in changes[:2]]
            summary_statement = " ".join(top_explanations)

        return {
            "status": "compared",
            "symbol": curr.symbol,
            "exchange": curr.exchange,
            "current_as_of": curr_time.isoformat(),
            "previous_as_of": prev_time.isoformat(),
            "comparison_period_hours": round(period_hours, 1),
            "methodology_version": curr.rule_version,
            "changes_count": len(changes),
            "changes": changes,
            "summary": summary_statement,
        }

    @staticmethod
    def get_snapshot_comparison(
        db: Session,
        symbol: str,
        exchange: str = "NSE",
        user_id: Optional[int] = None,
    ) -> dict:
        """
        Fetch the latest snapshot and the preceding snapshot for a symbol,
        and run the verified comparison engine.
        """
        clean_sym = symbol.strip().upper()
        clean_ex = exchange.strip().upper()

        # Query recent snapshots for this symbol
        query = (
            db.query(ResearchSnapshot)
            .filter(
                ResearchSnapshot.symbol == clean_sym,
                ResearchSnapshot.exchange == clean_ex,
            )
        )
        if user_id is not None:
            # Query either user-specific or global snapshots
            query = query.filter((ResearchSnapshot.user_id == user_id) | (ResearchSnapshot.user_id == None))
        else:
            query = query.filter(ResearchSnapshot.user_id == None)

        snapshots = query.order_by(desc(ResearchSnapshot.as_of)).limit(30).all()

        if not snapshots:
            return {
                "status": "no_prior_snapshot",
                "symbol": clean_sym,
                "exchange": clean_ex,
                "message": "No historical research snapshots recorded yet for this instrument.",
                "changes": [],
                "methodology_version": DEFAULT_METHODOLOGY_VERSION,
            }

        curr = snapshots[0]
        curr_as_of = ResearchSnapshotService._parse_datetime(curr.as_of)
        if not curr_as_of:
            return {
                "status": "incompatible",
                "reason": "Current snapshot has an unparseable observation timestamp.",
            }

        # Find the most recent strictly earlier COMPATIBLE baseline
        prev: Optional[ResearchSnapshot] = None
        incompatible_reasons = []

        for s in snapshots[1:]:
            s_time = ResearchSnapshotService._parse_datetime(s.as_of)
            if s_time and s_time < curr_as_of:
                comp = ResearchSnapshotService.compare_snapshots(curr, s)
                if comp.get("status") in ("compared", "identical_observation"):
                    prev = s
                    break
                else:
                    incompatible_reasons.append(comp.get("reason", "Incompatible parameters"))

        if not prev:
            if incompatible_reasons:
                return {
                    "status": "incompatible",
                    "reason": f"No compatible historical baseline found: {incompatible_reasons[0]}",
                }
            return {
                "status": "no_prior_snapshot",
                "symbol": clean_sym,
                "exchange": clean_ex,
                "current_as_of": curr_as_of.isoformat(),
                "message": "First valid research snapshot recorded. Awaiting a subsequent observation for comparison.",
                "changes": [],
                "methodology_version": curr.rule_version,
            }

        return ResearchSnapshotService.compare_snapshots(curr, prev)

    @staticmethod
    def get_radar_items(
        symbols: List[str],
        quotes: Dict[str, dict],
        technicals_map: Dict[str, dict],
        portfolio_summary: Optional[dict] = None,
    ) -> List[dict]:
        """
        Identify and rank research items worth investigating using transparent,
        documented quantitative criteria:
          1. High Volume Surge (>= 1.5x 20d average)
          2. Moving Average Cross (Price crossed SMA 20 or SMA 50)
          3. Momentum Extreme (RSI < 30 Oversold or RSI > 70 Overbought)
          4. Notable Daily Price Volatility (|Change %| >= 2.5%)
          5. Portfolio Sector Risk (Held in sector with > 35% exposure)

        Every item includes transparent evidence, risk context, and rationale.
        """
        radar_items = []
        concentrated_sectors = set()

        if portfolio_summary and isinstance(portfolio_summary.get("sector_allocation"), dict):
            for sec, pct in portfolio_summary["sector_allocation"].items():
                if isinstance(pct, (int, float)) and pct > 35.0:
                    concentrated_sectors.add(sec)

        for sym in symbols:
            clean = sym.strip().upper()
            quote = quotes.get(clean) or {}
            tech = technicals_map.get(clean) or {}

            price = quote.get("price")
            if not isinstance(price, (int, float)) or price <= 0:
                continue

            change_pct = quote.get("change_percent") or quote.get("change_pct") or 0.0
            volume_ratio = tech.get("vol_surge") or tech.get("volume_ratio")
            rsi = tech.get("rsi")
            sma20 = tech.get("sma_20")
            sma50 = tech.get("sma_50")
            sector = quote.get("sector") or NIFTY50_STOCKS.get(clean, {}).get("sector", "Equity")
            as_of = quote.get("as_of") or quote.get("exchange_timestamp")
            source = quote.get("source") or "yfinance/NSE"

            item_triggers = []

            # 1. Volume Surge Criterion
            if isinstance(volume_ratio, (int, float)) and volume_ratio >= 1.5:
                item_triggers.append({
                    "trigger_type": "VOLUME_SURGE",
                    "priority": 1,
                    "title": f"Elevated Volume ({volume_ratio:.1f}× 20-Day Average)",
                    "why": f"Volume is {volume_ratio:.1f}× its recent 20-day average.",
                    "evidence": f"Volume ratio: {volume_ratio:.1f}×, Current Price: ₹{price:,.2f} ({change_pct:+.2f}%).",
                    "risk": "Elevated volume reflects higher turnover; it does not confirm directional persistence.",
                })

            # 2. Momentum Extreme Criterion (RSI < 30 or > 70)
            if isinstance(rsi, (int, float)):
                if rsi > 70:
                    item_triggers.append({
                        "trigger_type": "MOMENTUM_OVERBOUGHT",
                        "priority": 2,
                        "title": f"Momentum Observation (RSI: {rsi:.1f})",
                        "why": f"14-day RSI is at {rsi:.1f}, which is in the conventional overbought zone (> 70).",
                        "evidence": f"RSI 14: {rsi:.1f}, Current price: ₹{price:,.2f}.",
                        "risk": "RSI is in the upper boundary (> 70). Indicator values above 70 reflect strong upward momentum but can consolidate or persist without an immediate reversal.",
                    })
                elif rsi < 30:
                    item_triggers.append({
                        "trigger_type": "MOMENTUM_OVERSOLD",
                        "priority": 2,
                        "title": f"Momentum Observation (RSI: {rsi:.1f})",
                        "why": f"14-day RSI is at {rsi:.1f}, which is in the conventional oversold zone (< 30).",
                        "evidence": f"RSI 14: {rsi:.1f}, Current price: ₹{price:,.2f}.",
                        "risk": "Oversold readings reflect extended downward momentum; indicator values can remain below 30 during protracted downtrends.",
                    })

            # 3. Moving Average Proximity / Trend Test
            if isinstance(sma20, (int, float)):
                dist_pct = ((price - sma20) / sma20) * 100.0
                if abs(dist_pct) <= 0.8:
                    item_triggers.append({
                        "trigger_type": "MA_TEST",
                        "priority": 3,
                        "title": f"Testing 20-Day Moving Average (₹{sma20:,.2f})",
                        "why": f"Price is testing its 20-day moving average within {abs(dist_pct):.1f}%, a key short-term pivot level.",
                        "evidence": f"Price: ₹{price:,.2f}, 20-Day SMA: ₹{sma20:,.2f} (Delta: {dist_pct:+.1f}%).",
                        "risk": "Testing a moving average indicates consolidation around the mean; direction of breakout remains to be confirmed.",
                    })

            # 4. Notable Daily Price Volatility
            if abs(change_pct) >= 2.5:
                item_triggers.append({
                    "trigger_type": "PRICE_VOLATILITY",
                    "priority": 4,
                    "title": f"Notable Daily Move ({change_pct:+.2f}%)",
                    "why": f"Price moved {change_pct:+.2f}% today, displaying elevated single-stock price movement.",
                    "evidence": f"Change: {change_pct:+.2f}%, Today's Price: ₹{price:,.2f}.",
                    "risk": "Elevated single-stock movement requires strict adherence to predefined risk limits and stop-loss boundaries.",
                })

            # 5. Portfolio Sector Risk Criterion
            if sector in concentrated_sectors:
                sec_pct = portfolio_summary.get("sector_allocation", {}).get(sector, 0)
                item_triggers.append({
                    "trigger_type": "SECTOR_CONCENTRATION",
                    "priority": 5,
                    "title": f"Sector Concentration Alert ({sector}: {sec_pct:.1f}%)",
                    "why": f"This company belongs to your {sector} allocation, which represents {sec_pct:.1f}% of your portfolio (> {DEFAULT_SECTOR_CONCENTRATION_THRESHOLD}% default guideline).",
                    "evidence": f"Sector: {sector}, Portfolio Weight: {sec_pct:.1f}% (Application default threshold: {DEFAULT_SECTOR_CONCENTRATION_THRESHOLD}%).",
                    "risk": "Single-sector concentration increases portfolio sensitivity to industry-specific conditions. The threshold is an application risk guideline, not a universal financial mandate.",
                })

            if item_triggers:
                # Calculate composite severity score: priority 1 gives 9 pts, priority 5 gives 5 pts
                ranking_score = sum((10 - t["priority"]) for t in item_triggers)
                item_triggers.sort(key=lambda t: t["priority"])
                primary = item_triggers[0]
                radar_items.append({
                    "symbol": clean,
                    "name": quote.get("name") or NIFTY50_STOCKS.get(clean, {}).get("name", clean),
                    "sector": sector,
                    "price": round(price, 2),
                    "change_pct": round(change_pct, 2),
                    "ranking_score": ranking_score,
                    "trigger_type": primary["trigger_type"],
                    "title": primary["title"],
                    "why": primary["why"],
                    "evidence": primary["evidence"],
                    "risk": primary["risk"],
                    "secondary_triggers": [t["title"] for t in item_triggers[1:]],
                    "as_of": as_of,
                    "source": source,
                })

        # Deterministic cross-instrument ranking:
        # 1. Composite trigger score descending
        # 2. Absolute daily move % descending
        # 3. Symbol alphabetically ascending (deterministic tie-breaker)
        radar_items.sort(key=lambda r: (-r["ranking_score"], -abs(r["change_pct"]), r["symbol"]))
        return radar_items

    @staticmethod
    def get_personalized_brief(db: Session, user_id: Optional[Union[int, str]] = None) -> dict:
        """
        Generate a comprehensive, personalized daily research brief.
        Combines:
          - Authoritative market overview and session state.
          - Material verified changes across the user's watchlist.
          - Portfolio exposure (when holdings exist).
          - Transparent radar focus items.
          - Contextual onboarding when watchlist or portfolio is empty.
        """
        now = datetime.now(timezone.utc)
        watchlist_symbols: List[str] = []

        if user_id is not None:
            uid_str = str(user_id)
            items = (
                db.query(WatchlistItem.symbol)
                .filter(WatchlistItem.user_id == uid_str)
                .order_by(WatchlistItem.added_at.desc())
                .all()
            )
            watchlist_symbols = [i[0].upper() for i in items]

            # If empty, also check legacy table "WatchlistItem" in case table is pending migration
            if not watchlist_symbols:
                try:
                    from sqlalchemy import text
                    legacy_rows = db.execute(
                        text('SELECT symbol FROM "WatchlistItem" WHERE user_id = :uid ORDER BY added_at DESC'),
                        {"uid": uid_str}
                    ).fetchall()
                    if legacy_rows:
                        watchlist_symbols = [r[0].upper() for r in legacy_rows]
                except Exception:
                    pass

        # Fetch portfolio summary
        portfolio_summary: Optional[dict] = None
        if user_id is not None:
            try:
                portfolio_summary = PortfolioService.get_portfolio_summary(user_id, db)
            except Exception as e:
                logger.warning("[PersonalizedBrief] Could not fetch portfolio: %s", e)

        has_portfolio = (
            portfolio_summary is not None
            and portfolio_summary.get("status") != "empty"
            and portfolio_summary.get("holdings_count", 0) > 0
        )

        has_watchlist = len(watchlist_symbols) > 0

        # Symbols to evaluate for radar: user's watchlist + any portfolio holdings
        eval_symbols = list(set(watchlist_symbols))
        if has_portfolio:
            for h in portfolio_summary.get("holdings", []):
                sym = h.get("symbol")
                if sym and sym not in eval_symbols:
                    eval_symbols.append(sym)

        # Default fallback symbols if user has none
        is_onboarding = not has_watchlist and not has_portfolio
        if is_onboarding:
            eval_symbols = ["RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK"]

        # Fetch quotes and compute technicals for radar evaluation & bounded snapshot refresh
        quotes_map: Dict[str, dict] = {}
        technicals_map: Dict[str, dict] = {}

        try:
            from services.market_data_service import market_data_service
            from ai_models.prediction_engine import PredictionEngine
            pred_engine = PredictionEngine()

            uid_arg = str(user_id) if user_id is not None else None
            quotes_map = market_data_service.get_watchlist_quotes(
                eval_symbols[:15],
                user_id=uid_arg,
                exchange="NSE",
                db=db,
            )

            for sym in eval_symbols[:15]:
                q = quotes_map.get(sym) or {}
                if q.get("status") != "unavailable" and isinstance(q.get("price"), (int, float)):
                    candles = market_data_service.get_ohlcv(sym, "1Y", False, "NSE")
                    tech = pred_engine.compute_technicals_from_ohlcv(candles, q["price"]) if candles else {}
                    technicals_map[sym] = tech

                    # Record / refresh snapshot for followed companies so comparisons remain fresh
                    if sym in watchlist_symbols:
                        ResearchSnapshotService.record_snapshot(
                            db=db,
                            symbol=sym,
                            quote_data=q,
                            technicals=tech,
                            exchange="NSE",
                            user_id=user_id,
                        )
        except Exception as err:
            logger.debug("[PersonalizedBrief] Radar quotes fetch exception: %s", err)

        # Generate ranked radar items across instruments
        radar_items = ResearchSnapshotService.get_radar_items(
            eval_symbols[:15],
            quotes=quotes_map,
            technicals_map=technicals_map,
            portfolio_summary=portfolio_summary,
        )

        # Fetch comparisons for followed symbols
        watchlist_changes = []
        for sym in watchlist_symbols[:10]:
            comp = ResearchSnapshotService.get_snapshot_comparison(db, sym, "NSE", user_id)
            if comp.get("status") == "compared" and comp.get("changes"):
                watchlist_changes.append({
                    "symbol": sym,
                    "changes_count": comp["changes_count"],
                    "top_change": comp["changes"][0]["explanation"],
                    "all_changes": comp["changes"],
                    "comparison_period_hours": comp["comparison_period_hours"],
                    "previous_as_of": comp["previous_as_of"],
                    "current_as_of": comp["current_as_of"],
                })

        return {
            "status": "success",
            "as_of": now.isoformat(),
            "user_id": user_id,
            "has_watchlist": has_watchlist,
            "watchlist_count": len(watchlist_symbols),
            "has_portfolio": has_portfolio,
            "is_onboarding": is_onboarding,
            "watchlist_changes": watchlist_changes,
            "radar_items": radar_items,
            "portfolio_exposure": {
                "total_invested": portfolio_summary.get("total_invested") if has_portfolio else 0.0,
                "current_value": portfolio_summary.get("current_value") if has_portfolio else 0.0,
                "total_pnl": portfolio_summary.get("total_pnl") if has_portfolio else 0.0,
                "total_pnl_pct": portfolio_summary.get("total_pnl_pct") if has_portfolio else 0.0,
                "day_pnl": portfolio_summary.get("day_pnl") if has_portfolio else 0.0,
                "day_pnl_pct": portfolio_summary.get("day_pnl_pct") if has_portfolio else 0.0,
                "holdings_count": portfolio_summary.get("holdings_count", 0) if has_portfolio else 0,
                "sector_allocation": portfolio_summary.get("sector_allocation", {}) if has_portfolio else {},
                "concentrated_sectors": [
                    s for s, pct in (portfolio_summary.get("sector_allocation", {}).items() if has_portfolio else [])
                    if isinstance(pct, (int, float)) and pct > 35.0
                ],
            },
            "onboarding_action": (
                {
                    "title": "Build your personal research desk",
                    "message": "Follow companies on NSE to track verified indicator shifts, or add your equity holdings to monitor portfolio exposure.",
                    "primary_link": "/stocks",
                    "primary_label": "Explore NSE Equities",
                    "secondary_link": "/portfolio",
                    "secondary_label": "Add Portfolio Holdings",
                }
                if is_onboarding
                else None
            ),
            "disclaimer": "Deterministic quantitative analysis based on documented rules. Not investment advice.",
        }


research_snapshot_service = ResearchSnapshotService()
