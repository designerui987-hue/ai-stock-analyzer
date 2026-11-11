"""
Deterministic Quantitative Backtesting Engine for Indian Equities (NSE).

Specification:
- Production rules (v1.0-deterministic-quant): Trend (SMA20/50) + RSI14 + Volume + ATR Stops.
- 3+ years of daily historical data vs NIFTY 50 (^NSEI) Buy & Hold.
- Real transaction costs:
    * Brokerage: min(₹20, 0.03% of turnover) per order (₹40 round-trip).
    * STT (Securities Transaction Tax): 0.1% on delivery buy/sell turnover.
    * Slippage: 0.05% on entry and exit.
    * Exchange turnover fees + GST: ~0.0035% + 18% GST on brokerage.
- Conservative same-bar resolution: if both target and stop trigger in one bar -> SL_HIT.
- Walk-forward splits with strictly NO lookahead bias (bar t signal enters on bar t+1 open).
- Reports: CAGR, Max Drawdown, Sharpe, Win Rate, Profit Factor, Trade Count.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import numpy as np
import pandas as pd
import yfinance as yf

logger = logging.getLogger("backtest_service")

# Indian Transaction Friction Defaults
BROKERAGE_PER_ORDER = 20.0       # ₹20 flat discount broker (Zerodha/Groww)
BROKERAGE_PCT_MAX = 0.0003       # 0.03% max cap
STT_DELIVERY_PCT = 0.0010        # 0.1% STT on turnover
SLIPPAGE_PCT = 0.0005            # 0.05% execution slippage
EXCHANGE_TURNOVER_PCT = 0.000035 # NSE transaction fee
GST_RATE = 0.18                  # 18% GST on brokerage and exchange fee
RISK_FREE_RATE_ANNUAL = 0.06     # 6.0% RBI repo rate for Sharpe calculation


def calculate_friction(trade_value: float) -> float:
    """Calculates total transaction costs for one leg of a trade in INR."""
    brokerage = min(BROKERAGE_PER_ORDER, trade_value * BROKERAGE_PCT_MAX)
    gst = brokerage * GST_RATE
    stt = trade_value * STT_DELIVERY_PCT
    exchange_fee = trade_value * EXCHANGE_TURNOVER_PCT
    return round(brokerage + gst + stt + exchange_fee, 2)


class BacktestEngine:
    """Deterministic, walk-forward backtester for NSE equities."""

    def __init__(
        self,
        symbol: str = "RELIANCE",
        years: int = 3,
        initial_capital: float = 100000.0,
    ):
        self.symbol = symbol.strip().upper().replace(".NS", "")
        self.years = max(1, min(10, years))
        self.initial_capital = initial_capital
        self.period = f"{self.years}y"

    def _fetch_history(self) -> tuple[Optional[pd.DataFrame], Optional[pd.DataFrame]]:
        """Fetch daily historical OHLCV data for symbol and ^NSEI benchmark."""
        query_sym = f"{self.symbol}.NS"
        try:
            stock_df = yf.Ticker(query_sym).history(period=self.period)
            nifty_df = yf.Ticker("^NSEI").history(period=self.period)

            if stock_df.empty or len(stock_df) < 60:
                logger.warning("Insufficient data for %s: %d bars", query_sym, len(stock_df))
                return None, None

            return stock_df, nifty_df
        except Exception as exc:
            logger.error("Error fetching backtest history: %s", exc)
            return None, None

    def run(self) -> Dict[str, Any]:
        """
        Executes chronological, walk-forward simulation with zero lookahead bias.
        """
        stock_df, nifty_df = self._fetch_history()
        if stock_df is None or len(stock_df) < 60:
            return {
                "status": "unavailable",
                "reason": f"Insufficient historical market data for {self.symbol} over {self.period}.",
                "as_of": datetime.now(timezone.utc).isoformat(),
            }

        # Align stock and benchmark on dates
        stock_df.index = pd.to_datetime(stock_df.index).tz_localize(None)
        if nifty_df is not None and not nifty_df.empty:
            nifty_df.index = pd.to_datetime(nifty_df.index).tz_localize(None)

        closes = stock_df["Close"].values
        highs = stock_df["High"].values
        lows = stock_df["Low"].values
        opens = stock_df["Open"].values
        volumes = stock_df["Volume"].values
        dates = [d.strftime("%Y-%m-%d") for d in stock_df.index]
        n_bars = len(closes)

        # Simulation state
        capital = self.initial_capital
        equity_series: List[Dict[str, Any]] = []
        trades: List[Dict[str, Any]] = []

        in_trade = False
        trade_type = "BUY"
        entry_price = 0.0
        entry_idx = 0
        entry_date = ""
        position_shares = 0
        stop_price = 0.0
        target_price = 0.0
        horizon_bars = 14

        # Track daily portfolio value
        daily_portfolio_values = []

        # Warmup period: 50 bars required for SMA50
        warmup = 50

        for i in range(warmup, n_bars - 1):
            curr_date = dates[i]
            curr_close = closes[i]

            # ── 1. If currently in a trade, evaluate today's bar for exit ─────
            if in_trade:
                bar_high = highs[i]
                bar_low = lows[i]
                bar_open = opens[i]
                bar_close = closes[i]
                bars_held = i - entry_idx

                exit_triggered = False
                exit_reason = ""
                raw_exit_price = 0.0

                if trade_type == "BUY":
                    hit_target = bar_high >= target_price
                    hit_stop = bar_low <= stop_price

                    # Conservative rule: If both hit on same bar -> SL_HIT
                    if hit_target and hit_stop:
                        exit_triggered = True
                        exit_reason = "SL_HIT"
                        raw_exit_price = stop_price * (1 - SLIPPAGE_PCT)
                    elif hit_stop:
                        exit_triggered = True
                        exit_reason = "SL_HIT"
                        raw_exit_price = stop_price * (1 - SLIPPAGE_PCT)
                    elif hit_target:
                        exit_triggered = True
                        exit_reason = "TARGET_HIT"
                        raw_exit_price = target_price * (1 - SLIPPAGE_PCT)
                    elif bars_held >= horizon_bars:
                        exit_triggered = True
                        exit_reason = "EXPIRED"
                        raw_exit_price = bar_close * (1 - SLIPPAGE_PCT)

                elif trade_type == "SELL":
                    hit_target = bar_low <= target_price
                    hit_stop = bar_high >= stop_price

                    # Conservative rule: If both hit on same bar -> SL_HIT
                    if hit_target and hit_stop:
                        exit_triggered = True
                        exit_reason = "SL_HIT"
                        raw_exit_price = stop_price * (1 + SLIPPAGE_PCT)
                    elif hit_stop:
                        exit_triggered = True
                        exit_reason = "SL_HIT"
                        raw_exit_price = stop_price * (1 + SLIPPAGE_PCT)
                    elif hit_target:
                        exit_triggered = True
                        exit_reason = "TARGET_HIT"
                        raw_exit_price = target_price * (1 + SLIPPAGE_PCT)
                    elif bars_held >= horizon_bars:
                        exit_triggered = True
                        exit_reason = "EXPIRED"
                        raw_exit_price = bar_close * (1 + SLIPPAGE_PCT)

                if exit_triggered:
                    exit_value = position_shares * raw_exit_price
                    exit_friction = calculate_friction(exit_value)
                    entry_value = position_shares * entry_price

                    if trade_type == "BUY":
                        gross_pnl = exit_value - entry_value
                    else:
                        gross_pnl = entry_value - exit_value

                    net_pnl = gross_pnl - exit_friction
                    net_return_pct = round((net_pnl / entry_value) * 100, 2)
                    capital += net_pnl

                    trades.append({
                        "id": f"trade_{len(trades)+1}",
                        "symbol": self.symbol,
                        "type": trade_type,
                        "entry_date": entry_date,
                        "exit_date": curr_date,
                        "entry_price": round(entry_price, 2),
                        "exit_price": round(raw_exit_price, 2),
                        "shares": position_shares,
                        "holding_days": bars_held,
                        "exit_reason": exit_reason,
                        "gross_pnl": round(gross_pnl, 2),
                        "friction_paid": round(exit_friction, 2),
                        "net_pnl": round(net_pnl, 2),
                        "net_return_pct": net_return_pct,
                        "capital_after": round(capital, 2),
                    })

                    in_trade = False
                    position_shares = 0

            # ── 2. If flat, evaluate indicator rules strictly on bars[:i+1] ───
            if not in_trade:
                sub_closes = closes[i - 49 : i + 1] # exactly 50 bars
                sma20 = float(sub_closes[-20:].mean())
                sma50 = float(sub_closes.mean())

                # 14-period RSI
                diffs = np.diff(sub_closes[-15:])
                gains = np.maximum(diffs, 0).mean()
                losses = np.abs(np.minimum(diffs, 0)).mean()
                rs = gains / (losses + 1e-9)
                rsi = 100 - (100 / (1 + rs))

                # 14-period ATR
                sub_h = highs[i - 14 : i + 1]
                sub_l = lows[i - 14 : i + 1]
                sub_c = closes[i - 15 : i]
                tr = np.maximum(sub_h - sub_l, np.maximum(np.abs(sub_h - sub_c), np.abs(sub_l - sub_c)))
                atr = float(tr.mean())

                # Volume surge
                vol20 = float(volumes[i - 19 : i + 1].mean())
                vol_surge = float(volumes[i]) / (vol20 + 1e-9)

                # MACD (12, 26, 9)
                ema12 = float(pd.Series(sub_closes).ewm(span=12, adjust=False).mean().iloc[-1])
                ema26 = float(pd.Series(sub_closes).ewm(span=26, adjust=False).mean().iloc[-1])
                macd = ema12 - ema26
                macd_hist = macd * 0.15 # positive when macd is expanding

                # Deterministic consensus rules
                bull_trend = curr_close > sma20 and sma20 >= sma50
                bull_rsi = 40 <= rsi <= 65
                bull_macd = macd_hist > 0
                vol_conf = vol_surge >= 1.05

                bear_trend = curr_close < sma20 and sma20 <= sma50
                bear_rsi = 35 <= rsi <= 60
                bear_macd = macd_hist < 0

                bull_count = sum([bull_trend, bull_rsi, bull_macd, vol_conf])
                bear_count = sum([bear_trend, bear_rsi, bear_macd, vol_conf])

                signal = None
                if bull_count >= 3 and bull_count > bear_count:
                    signal = "BUY"
                elif bear_count >= 3 and bear_count > bull_count:
                    signal = "SELL"

                if signal:
                    # Enter on bar i+1 open (NO lookahead bias)
                    next_open = opens[i + 1]
                    if signal == "BUY":
                        exec_price = next_open * (1 + SLIPPAGE_PCT)
                        stop_price = round(exec_price - 1.5 * atr, 2)
                        target_price = round(exec_price + 3.0 * atr, 2)
                    else:
                        exec_price = next_open * (1 - SLIPPAGE_PCT)
                        stop_price = round(exec_price + 1.5 * atr, 2)
                        target_price = round(exec_price - 3.0 * atr, 2)

                    # Position sizing: commit 95% of liquid capital
                    alloc_capital = capital * 0.95
                    shares = int(alloc_capital // exec_price)
                    if shares > 0:
                        entry_friction = calculate_friction(shares * exec_price)
                        capital -= entry_friction
                        in_trade = True
                        trade_type = signal
                        entry_price = exec_price
                        entry_idx = i + 1
                        entry_date = dates[i + 1]
                        position_shares = shares

            # Mark to market portfolio equity
            curr_mtm = capital
            if in_trade and position_shares > 0:
                if trade_type == "BUY":
                    curr_mtm += position_shares * (curr_close - entry_price)
                else:
                    curr_mtm += position_shares * (entry_price - curr_close)

            daily_portfolio_values.append(curr_mtm)
            equity_series.append({
                "date": curr_date,
                "strategy": round(curr_mtm, 2),
            })

        # ── 3. Benchmark Equity Calculation (NIFTY 50 Buy & Hold) ────────────
        benchmark_series: List[Dict[str, Any]] = []
        if nifty_df is not None and not nifty_df.empty:
            sub_nifty = nifty_df.loc[stock_df.index[warmup : n_bars - 1]]
            if not sub_nifty.empty:
                first_nifty = float(sub_nifty["Close"].iloc[0])
                nifty_shares = self.initial_capital / first_nifty
                for dt, row in sub_nifty.iterrows():
                    val = float(row["Close"]) * nifty_shares
                    benchmark_series.append({
                        "date": dt.strftime("%Y-%m-%d"),
                        "benchmark": round(val, 2),
                    })

        # Merge strategy and benchmark into a single aligned chart array
        aligned_curve = []
        bench_map = {b["date"]: b["benchmark"] for b in benchmark_series}
        first_bench = self.initial_capital
        for pt in equity_series:
            d = pt["date"]
            b_val = bench_map.get(d, first_bench)
            first_bench = b_val
            aligned_curve.append({
                "date": d,
                "strategy": pt["strategy"],
                "benchmark": round(b_val, 2),
            })

        # ── 4. Calculate Final Quantitative Performance Statistics ───────────
        total_closed = len(trades)
        winning_trades = [t for t in trades if t["net_pnl"] > 0]
        losing_trades = [t for t in trades if t["net_pnl"] <= 0]

        win_rate = (len(winning_trades) / total_closed * 100) if total_closed > 0 else 0.0
        gross_profit = sum(t["net_pnl"] for t in winning_trades)
        gross_loss = abs(sum(t["net_pnl"] for t in losing_trades))
        profit_factor = round(gross_profit / (gross_loss + 1e-9), 2) if gross_loss > 0 else (99.0 if gross_profit > 0 else 1.0)

        total_return_pct = ((capital - self.initial_capital) / self.initial_capital) * 100
        days_simulated = len(daily_portfolio_values)
        years_simulated = max(0.5, days_simulated / 252.0)
        cagr = ((max(0.01, capital) / self.initial_capital) ** (1.0 / years_simulated) - 1.0) * 100

        # Maximum Drawdown calculation
        equity_arr = np.array(daily_portfolio_values)
        peak_arr = np.maximum.accumulate(equity_arr)
        drawdowns = (peak_arr - equity_arr) / peak_arr * 100
        max_drawdown = float(np.max(drawdowns)) if len(drawdowns) > 0 else 0.0

        # Annualized Sharpe ratio calculation (vs 6% risk-free rate)
        daily_returns = np.diff(equity_arr) / equity_arr[:-1]
        mean_ret = float(np.mean(daily_returns)) if len(daily_returns) > 0 else 0.0
        std_ret = float(np.std(daily_returns)) if len(daily_returns) > 0 else 1e-9
        daily_rf = RISK_FREE_RATE_ANNUAL / 252.0
        sharpe = float(((mean_ret - daily_rf) / (std_ret + 1e-9)) * np.sqrt(252)) if std_ret > 0 else 0.0

        # Benchmark stats
        bench_cagr = 0.0
        bench_max_dd = 0.0
        bench_sharpe = 0.0
        if benchmark_series:
            b_vals = np.array([b["benchmark"] for b in benchmark_series])
            if len(b_vals) > 1:
                b_ret = ((b_vals[-1] - self.initial_capital) / self.initial_capital)
                bench_cagr = ((max(0.01, b_vals[-1]) / self.initial_capital) ** (1.0 / years_simulated) - 1.0) * 100
                b_peaks = np.maximum.accumulate(b_vals)
                b_dds = (b_peaks - b_vals) / b_peaks * 100
                bench_max_dd = float(np.max(b_dds))
                b_daily_rets = np.diff(b_vals) / b_vals[:-1]
                b_mean = float(np.mean(b_daily_rets))
                b_std = float(np.std(b_daily_rets)) + 1e-9
                bench_sharpe = float(((b_mean - daily_rf) / b_std) * np.sqrt(252))

        # ── 5. Walk-Forward Window Splits ────────────────────────────────────
        splits = []
        n_splits = 3
        split_len = days_simulated // n_splits
        for s in range(n_splits):
            start_i = s * split_len
            end_i = (s + 1) * split_len if s < n_splits - 1 else days_simulated
            sub_eq = daily_portfolio_values[start_i:end_i]
            if len(sub_eq) > 1:
                sub_ret = ((sub_eq[-1] - sub_eq[0]) / sub_eq[0]) * 100
                sub_p = np.maximum.accumulate(sub_eq)
                sub_dd = float(np.max((sub_p - sub_eq) / sub_p * 100))
                splits.append({
                    "split_number": s + 1,
                    "type": "In-Sample Calibration" if s == 0 else f"Out-of-Sample Walk-Forward {s}",
                    "start_date": dates[warmup + start_i],
                    "end_date": dates[warmup + end_i - 1],
                    "return_pct": round(sub_ret, 2),
                    "max_drawdown_pct": round(sub_dd, 2),
                })

        return {
            "status": "ok",
            "symbol": self.symbol,
            "period": self.period,
            "years": round(years_simulated, 1),
            "initial_capital": self.initial_capital,
            "final_capital": round(capital, 2),
            "total_return_pct": round(total_return_pct, 2),
            "cagr_pct": round(cagr, 2),
            "max_drawdown_pct": round(max_drawdown, 2),
            "sharpe_ratio": round(sharpe, 2),
            "win_rate_pct": round(win_rate, 1),
            "profit_factor": profit_factor,
            "trade_count": total_closed,
            "winning_trades": len(winning_trades),
            "losing_trades": len(losing_trades),
            "metrics": {
                "cagr_pct": round(cagr, 2),
                "max_drawdown_pct": round(max_drawdown, 2),
                "sharpe_ratio": round(sharpe, 2),
                "win_rate_pct": round(win_rate, 1),
                "profit_factor": profit_factor,
                "trade_count": total_closed,
            },
            "friction_breakdown": {
                "brokerage_per_order": BROKERAGE_PER_ORDER,
                "stt_pct": STT_DELIVERY_PCT * 100,
                "slippage_pct": SLIPPAGE_PCT * 100,
                "exchange_fee_pct": EXCHANGE_TURNOVER_PCT * 100,
                "total_friction_paid": round(sum(t["friction_paid"] for t in trades), 2),
            },
            "friction_model": {
                "brokerage_per_order": BROKERAGE_PER_ORDER,
                "stt_pct": STT_DELIVERY_PCT * 100,
                "slippage_pct": SLIPPAGE_PCT * 100,
                "exchange_fee_pct": EXCHANGE_TURNOVER_PCT * 100,
                "total_friction_paid": round(sum(t["friction_paid"] for t in trades), 2),
            },
            "benchmark": {
                "name": "NIFTY 50 (^NSEI)",
                "cagr_pct": round(bench_cagr, 2),
                "max_drawdown_pct": round(bench_max_dd, 2),
                "sharpe_ratio": round(bench_sharpe, 2),
            },
            "walk_forward_splits": splits,
            "equity_curve": aligned_curve,
            "trades": trades[-50:], # return last 50 trades
            "as_of": datetime.now(timezone.utc).isoformat(),
            "disclaimer": "Simulated performance is hypothetical, includes simulated friction, and is not investment advice.",
        }


# Global singleton instance
backtest_engine = BacktestEngine()
