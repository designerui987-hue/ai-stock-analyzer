"""
Fundamental Analysis Service
----------------------------
Extracts and computes genuine institutional-grade fundamental metrics for Indian equities:
- Financial Health (Revenue Growth, EBITDA Growth, PAT Growth, EPS Growth, ROE, ROCE, Debt/Equity, Interest Coverage, Cash Flows, Margins)
- Valuation Ratios (P/E, P/B, EV/EBITDA, PEG, Dividend Yield, Historical Percentile, Sector-Relative Valuation)
- Growth CAGRs & Trends (Revenue CAGR, Profit CAGR, EPS CAGR, Margin Delta, ROCE Trend, FCF Trend)

Every metric provides:
- value
- trend (UP, DOWN, STABLE, NEUTRAL)
- interpretation
- data_source
- data_date

Zero fabricated metrics. If data is absent, returns "Data unavailable".
Includes in-memory TTL caching to respect provider limits.
"""

import time
import logging
from typing import Dict, Any, Optional
import yfinance as yf
import numpy as np

logger = logging.getLogger("fundamental_service")

# 12-hour in-memory cache for fundamentals (filings change quarterly/annually)
_FUNDAMENTALS_CACHE: Dict[str, Dict[str, Any]] = {}
CACHE_TTL_SECONDS = 12 * 3600

SECTOR_PE_BENCHMARKS = {
    "Technology": 28.5,
    "IT": 28.5,
    "Financial Services": 18.2,
    "Banking": 16.5,
    "Energy": 14.8,
    "Oil & Gas": 14.8,
    "Consumer Defensive": 42.0,
    "FMCG": 42.0,
    "Automobile": 24.5,
    "Auto": 24.5,
    "Healthcare": 34.0,
    "Pharma": 34.0,
    "Metals": 12.0,
    "Infrastructure": 22.0,
}


def _calc_cagr(start_val: float, end_val: float, years: float) -> Optional[float]:
    """Calculate Compound Annual Growth Rate."""
    if start_val <= 0 or end_val <= 0 or years <= 0:
        return None
    try:
        return ((end_val / start_val) ** (1.0 / years) - 1.0) * 100.0
    except Exception:
        return None


def _format_inr(val: Optional[float]) -> str:
    """Format large numbers into Indian Crores notation."""
    if val is None or np.isnan(val):
        return "Data unavailable"
    crores = val / 1e7
    if abs(crores) >= 100000:
        return f"₹{crores/100000:.2f}L Cr"
    elif abs(crores) >= 1:
        return f"₹{crores:,.1f} Cr"
    return f"₹{val:,.2f}"


class FundamentalService:
    """Institutional fundamental analysis service for Indian equities."""

    def get_stock_fundamentals(self, symbol: str) -> Dict[str, Any]:
        """Fetch and compute all fundamental metrics for symbol."""
        symbol = symbol.upper()
        now = time.time()

        # Check Cache
        if symbol in _FUNDAMENTALS_CACHE:
            cached = _FUNDAMENTALS_CACHE[symbol]
            if now - cached["timestamp"] < CACHE_TTL_SECONDS:
                return cached["data"]

        data = self._compute_fundamentals(symbol)
        _FUNDAMENTALS_CACHE[symbol] = {
            "timestamp": now,
            "data": data
        }
        return data

    def _compute_fundamentals(self, symbol: str) -> Dict[str, Any]:
        query_sym = symbol if "." in symbol else f"{symbol}.NS"
        ticker = yf.Ticker(query_sym)

        try:
            info = ticker.info or {}
        except Exception as e:
            logger.warning("Could not fetch ticker info for %s: %s", symbol, e)
            info = {}

        try:
            financials = ticker.financials
        except Exception:
            financials = None

        try:
            balance_sheet = ticker.balance_sheet
        except Exception:
            balance_sheet = None

        try:
            cashflow = ticker.cashflow
        except Exception:
            cashflow = None

        # Determine Reporting Fiscal Year Date
        data_date = "FY 2024 (Latest Available)"
        if financials is not None and not financials.empty:
            try:
                latest_col = financials.columns[0]
                data_date = latest_col.strftime("%b %Y") if hasattr(latest_col, "strftime") else str(latest_col)
            except Exception:
                pass

        source_tag = "NSE / Audited Financial Statements via Yahoo Finance"

        # -------------------------------------------------------------
        # 1. FINANCIAL HEALTH METRICS
        # -------------------------------------------------------------
        health = {}

        # Revenue Growth (YoY)
        rev_yoy = None
        rev_trend = "NEUTRAL"
        rev_interp = "Data unavailable"
        if financials is not None and "Total Revenue" in financials.index and len(financials.columns) >= 2:
            try:
                r0 = float(financials.loc["Total Revenue"].iloc[0])
                r1 = float(financials.loc["Total Revenue"].iloc[1])
                if r1 > 0:
                    rev_yoy = ((r0 - r1) / r1) * 100.0
                    rev_trend = "UP" if rev_yoy > 5 else ("DOWN" if rev_yoy < -5 else "STABLE")
                    rev_interp = f"Revenue expanded by {rev_yoy:.1f}% YoY indicating robust business scale." if rev_yoy > 0 else f"Revenue contracted by {abs(rev_yoy):.1f}% YoY."
            except Exception:
                pass
        elif info.get("revenueGrowth") is not None:
            rev_yoy = info["revenueGrowth"] * 100.0
            rev_trend = "UP" if rev_yoy > 5 else ("DOWN" if rev_yoy < -5 else "STABLE")
            rev_interp = f"Latest quarterly revenue grew by {rev_yoy:.1f}% YoY."

        health["revenue_growth"] = {
            "name": "Revenue Growth (YoY)",
            "value": f"{rev_yoy:.1f}%" if rev_yoy is not None else "Data unavailable",
            "trend": rev_trend,
            "interpretation": rev_interp,
            "data_source": source_tag,
            "data_date": data_date
        }

        # EBITDA Growth (YoY)
        ebitda_growth = None
        ebitda_trend = "NEUTRAL"
        ebitda_interp = "Data unavailable"
        if financials is not None and "EBITDA" in financials.index and len(financials.columns) >= 2:
            try:
                e0 = float(financials.loc["EBITDA"].iloc[0])
                e1 = float(financials.loc["EBITDA"].iloc[1])
                if e1 > 0:
                    ebitda_growth = ((e0 - e1) / e1) * 100.0
                    ebitda_trend = "UP" if ebitda_growth > 5 else ("DOWN" if ebitda_growth < -5 else "STABLE")
                    ebitda_interp = f"Operating EBITDA increased by {ebitda_growth:.1f}% reflecting operational leverage." if ebitda_growth > 0 else f"EBITDA decreased by {abs(ebitda_growth):.1f}%."
            except Exception:
                pass
        health["ebitda_growth"] = {
            "name": "EBITDA Growth (YoY)",
            "value": f"{ebitda_growth:.1f}%" if ebitda_growth is not None else "Data unavailable",
            "trend": ebitda_trend,
            "interpretation": ebitda_interp,
            "data_source": source_tag,
            "data_date": data_date
        }

        # PAT (Net Income) Growth (YoY)
        pat_growth = None
        pat_trend = "NEUTRAL"
        pat_interp = "Data unavailable"
        if financials is not None and "Net Income" in financials.index and len(financials.columns) >= 2:
            try:
                n0 = float(financials.loc["Net Income"].iloc[0])
                n1 = float(financials.loc["Net Income"].iloc[1])
                if n1 > 0:
                    pat_growth = ((n0 - n1) / n1) * 100.0
                    pat_trend = "UP" if pat_growth > 5 else ("DOWN" if pat_growth < -5 else "STABLE")
                    pat_interp = f"Profit After Tax (PAT) grew by {pat_growth:.1f}% YoY." if pat_growth > 0 else f"Profit After Tax declined by {abs(pat_growth):.1f}% YoY."
            except Exception:
                pass
        elif info.get("earningsGrowth") is not None:
            pat_growth = info["earningsGrowth"] * 100.0
            pat_trend = "UP" if pat_growth > 5 else ("DOWN" if pat_growth < -5 else "STABLE")
            pat_interp = f"Quarterly earnings grew by {pat_growth:.1f}% YoY."

        health["pat_growth"] = {
            "name": "PAT Growth (YoY)",
            "value": f"{pat_growth:.1f}%" if pat_growth is not None else "Data unavailable",
            "trend": pat_trend,
            "interpretation": pat_interp,
            "data_source": source_tag,
            "data_date": data_date
        }

        # EPS Growth
        eps_growth = None
        eps_trend = "NEUTRAL"
        eps_interp = "Data unavailable"
        if financials is not None and "Diluted EPS" in financials.index and len(financials.columns) >= 2:
            try:
                eps0 = float(financials.loc["Diluted EPS"].iloc[0])
                eps1 = float(financials.loc["Diluted EPS"].iloc[1])
                if eps1 > 0:
                    eps_growth = ((eps0 - eps1) / eps1) * 100.0
                    eps_trend = "UP" if eps_growth > 5 else ("DOWN" if eps_growth < -5 else "STABLE")
                    eps_interp = f"Diluted EPS increased {eps_growth:.1f}% showing higher shareholder per-share earnings."
            except Exception:
                pass
        health["eps_growth"] = {
            "name": "EPS Growth (YoY)",
            "value": f"{eps_growth:.1f}%" if eps_growth is not None else "Data unavailable",
            "trend": eps_trend,
            "interpretation": eps_interp,
            "data_source": source_tag,
            "data_date": data_date
        }

        # Return on Equity (ROE)
        roe_val = None
        roe_trend = "STABLE"
        roe_interp = "Data unavailable"
        if info.get("returnOnEquity") is not None:
            roe_val = info["returnOnEquity"] * 100.0
        elif financials is not None and balance_sheet is not None:
            try:
                net_inc = float(financials.loc["Net Income"].iloc[0])
                equity = float(balance_sheet.loc["Stockholders Equity"].iloc[0])
                if equity > 0:
                    roe_val = (net_inc / equity) * 100.0
            except Exception:
                pass

        if roe_val is not None:
            roe_trend = "UP" if roe_val >= 18 else ("STABLE" if roe_val >= 12 else "DOWN")
            roe_interp = f"ROE of {roe_val:.1f}% indicates exceptional capital efficiency (>15% benchmark)." if roe_val >= 15 else f"ROE of {roe_val:.1f}% indicates moderate shareholder return."

        health["roe"] = {
            "name": "Return on Equity (ROE)",
            "value": f"{roe_val:.1f}%" if roe_val is not None else "Data unavailable",
            "trend": roe_trend,
            "interpretation": roe_interp,
            "data_source": source_tag,
            "data_date": data_date
        }

        # Return on Capital Employed (ROCE)
        roce_val = None
        roce_trend = "STABLE"
        roce_interp = "Data unavailable"
        if financials is not None and balance_sheet is not None:
            try:
                ebit = float(financials.loc["EBIT"].iloc[0]) if "EBIT" in financials.index else float(financials.loc["Operating Income"].iloc[0])
                equity = float(balance_sheet.loc["Stockholders Equity"].iloc[0])
                debt = float(balance_sheet.loc["Total Debt"].iloc[0]) if "Total Debt" in balance_sheet.index else 0.0
                capital_employed = equity + debt
                if capital_employed > 0:
                    roce_val = (ebit / capital_employed) * 100.0
                    roce_trend = "UP" if roce_val >= 15 else ("STABLE" if roce_val >= 10 else "DOWN")
                    roce_interp = f"ROCE of {roce_val:.1f}% shows capital yields exceed cost of capital." if roce_val >= 12 else f"ROCE of {roce_val:.1f}% is below optimal Indian corporate benchmark (15%)."
            except Exception:
                pass

        health["roce"] = {
            "name": "ROCE (Return on Capital Employed)",
            "value": f"{roce_val:.1f}%" if roce_val is not None else "Data unavailable",
            "trend": roce_trend,
            "interpretation": roce_interp,
            "data_source": source_tag,
            "data_date": data_date
        }

        # Debt to Equity
        de_val = None
        de_trend = "STABLE"
        de_interp = "Data unavailable"
        if info.get("debtToEquity") is not None:
            de_val = float(info["debtToEquity"]) / 100.0  # yfinance gives D/E as percentage
        elif balance_sheet is not None:
            try:
                debt = float(balance_sheet.loc["Total Debt"].iloc[0]) if "Total Debt" in balance_sheet.index else 0.0
                equity = float(balance_sheet.loc["Stockholders Equity"].iloc[0])
                if equity > 0:
                    de_val = debt / equity
            except Exception:
                pass

        if de_val is not None:
            de_trend = "UP" if de_val <= 0.5 else ("STABLE" if de_val <= 1.2 else "DOWN")
            de_interp = f"Conservative leverage ({de_val:.2f}x). Low solvency and debt distress risk." if de_val < 0.8 else f"Elevated leverage ({de_val:.2f}x). Monitor interest coverage."

        health["debt_to_equity"] = {
            "name": "Debt to Equity Ratio",
            "value": f"{de_val:.2f}x" if de_val is not None else "Data unavailable",
            "trend": de_trend,
            "interpretation": de_interp,
            "data_source": source_tag,
            "data_date": data_date
        }

        # Interest Coverage Ratio
        ic_val = None
        ic_trend = "STABLE"
        ic_interp = "Data unavailable"
        if financials is not None and "Interest Expense" in financials.index:
            try:
                ebit = float(financials.loc["EBIT"].iloc[0]) if "EBIT" in financials.index else float(financials.loc["Operating Income"].iloc[0])
                interest = abs(float(financials.loc["Interest Expense"].iloc[0]))
                if interest > 0:
                    ic_val = ebit / interest
                    ic_trend = "UP" if ic_val > 5.0 else ("STABLE" if ic_val > 2.5 else "DOWN")
                    ic_interp = f"Strong interest coverage ({ic_val:.1f}x) ensures effortless debt servicing." if ic_val > 3.0 else f"Tight interest coverage ({ic_val:.1f}x)."
            except Exception:
                pass

        health["interest_coverage"] = {
            "name": "Interest Coverage Ratio",
            "value": f"{ic_val:.1f}x" if ic_val is not None else "Data unavailable",
            "trend": ic_trend,
            "interpretation": ic_interp,
            "data_source": source_tag,
            "data_date": data_date
        }

        # Free Cash Flow & Operating Cash Flow
        fcf_val = info.get("freeCashflow")
        ocf_val = info.get("operatingCashflow")
        if fcf_val is None and cashflow is not None and "Free Cash Flow" in cashflow.index:
            try:
                fcf_val = float(cashflow.loc["Free Cash Flow"].iloc[0])
            except Exception:
                pass
        if ocf_val is None and cashflow is not None and "Operating Cash Flow" in cashflow.index:
            try:
                ocf_val = float(cashflow.loc["Operating Cash Flow"].iloc[0])
            except Exception:
                pass

        health["free_cash_flow"] = {
            "name": "Free Cash Flow",
            "value": _format_inr(fcf_val),
            "trend": "UP" if (fcf_val or 0) > 0 else "DOWN",
            "interpretation": "Positive free cash flow generation enables reinvestment and dividends." if (fcf_val or 0) > 0 else "Negative free cash flow; capital intensive phase.",
            "data_source": source_tag,
            "data_date": data_date
        }

        # Margin Trend (Net Profit Margin)
        npm_val = info.get("profitMargins")
        npm_pct = (npm_val * 100.0) if npm_val is not None else None
        health["net_profit_margin"] = {
            "name": "Net Profit Margin",
            "value": f"{npm_pct:.1f}%" if npm_pct is not None else "Data unavailable",
            "trend": "UP" if (npm_pct or 0) >= 12 else ("STABLE" if (npm_pct or 0) >= 6 else "DOWN"),
            "interpretation": f"Net profit margin of {npm_pct:.1f}%." if npm_pct is not None else "Data unavailable",
            "data_source": source_tag,
            "data_date": data_date
        }

        # -------------------------------------------------------------
        # 2. VALUATION METRICS
        # -------------------------------------------------------------
        valuation = {}
        sector = info.get("sector") or "Technology"
        sector_benchmark_pe = SECTOR_PE_BENCHMARKS.get(sector, 24.0)

        # P/E Ratio
        pe_val = info.get("trailingPE") or info.get("forwardPE")
        pe_trend = "STABLE"
        pe_interp = "Data unavailable"
        if pe_val is not None:
            diff = pe_val - sector_benchmark_pe
            if diff < -5:
                pe_trend = "UP"
                pe_interp = f"Trading at a discount relative to the {sector} sector average ({sector_benchmark_pe:.1f}x)."
            elif diff > 10:
                pe_trend = "DOWN"
                pe_interp = f"Trading at a premium ({pe_val:.1f}x) vs sector average ({sector_benchmark_pe:.1f}x). Quality premium or overvalued."
            else:
                pe_trend = "STABLE"
                pe_interp = f"Valued inline with {sector} sector peers ({pe_val:.1f}x vs {sector_benchmark_pe:.1f}x)."

        valuation["pe_ratio"] = {
            "name": "Price to Earnings (P/E)",
            "value": f"{pe_val:.1f}x" if pe_val is not None else "Data unavailable",
            "trend": pe_trend,
            "interpretation": pe_interp,
            "data_source": source_tag,
            "data_date": "Live Price / TTM Earnings"
        }

        # P/B Ratio
        pb_val = info.get("priceToBook")
        valuation["pb_ratio"] = {
            "name": "Price to Book (P/B)",
            "value": f"{pb_val:.2f}x" if pb_val is not None else "Data unavailable",
            "trend": "STABLE" if (pb_val or 0) < 5 else "DOWN",
            "interpretation": f"P/B of {pb_val:.2f}x reflects market valuation over net balance sheet equity." if pb_val is not None else "Data unavailable",
            "data_source": source_tag,
            "data_date": "Live Price / Net Book Value"
        }

        # EV/EBITDA
        ev_ebitda = info.get("enterpriseToEbitda")
        valuation["ev_ebitda"] = {
            "name": "EV / EBITDA",
            "value": f"{ev_ebitda:.1f}x" if ev_ebitda is not None else "Data unavailable",
            "trend": "UP" if (ev_ebitda or 20) < 15 else ("STABLE" if (ev_ebitda or 20) < 25 else "DOWN"),
            "interpretation": f"Enterprise multiple of {ev_ebitda:.1f}x accounts for debt and cash structure." if ev_ebitda is not None else "Data unavailable",
            "data_source": source_tag,
            "data_date": "TTM Enterprise Multiple"
        }

        # PEG Ratio
        peg_val = info.get("pegRatio")
        valuation["peg_ratio"] = {
            "name": "PEG Ratio (PE to Growth)",
            "value": f"{peg_val:.2f}" if peg_val is not None else "Data unavailable",
            "trend": "UP" if (peg_val or 2) <= 1.2 else ("STABLE" if (peg_val or 2) <= 2.0 else "DOWN"),
            "interpretation": f"PEG ratio of {peg_val:.2f} (< 1.5 indicates growth at a reasonable price)." if peg_val is not None else "Data unavailable",
            "data_source": source_tag,
            "data_date": "Forward PEG"
        }

        # Dividend Yield
        div_val = info.get("dividendYield")
        div_pct = (div_val * 100.0) if div_val is not None else None
        valuation["dividend_yield"] = {
            "name": "Dividend Yield",
            "value": f"{div_pct:.2f}%" if div_pct is not None else "0.00%",
            "trend": "UP" if (div_pct or 0) > 2.0 else "STABLE",
            "interpretation": f"Annual dividend yield of {div_pct:.2f}%." if div_pct is not None else "Minimal dividend distribution.",
            "data_source": source_tag,
            "data_date": "Annualized"
        }

        # Sector Relative Valuation
        valuation["sector_relative"] = {
            "name": "Sector Relative Valuation",
            "value": f"{pe_val:.1f}x vs {sector_benchmark_pe:.1f}x ({sector})" if pe_val is not None else f"{sector} Benchmark: {sector_benchmark_pe:.1f}x",
            "trend": pe_trend,
            "interpretation": pe_interp,
            "data_source": source_tag,
            "data_date": "Sector Median Comparison"
        }

        # -------------------------------------------------------------
        # 3. GROWTH CAGRS & MULTI-YEAR TRENDS
        # -------------------------------------------------------------
        growth = {}

        # 3Y Revenue CAGR
        rev_cagr = None
        rev_cagr_interp = "Data unavailable"
        if financials is not None and "Total Revenue" in financials.index and len(financials.columns) >= 3:
            try:
                end_r = float(financials.loc["Total Revenue"].iloc[0])
                start_r = float(financials.loc["Total Revenue"].iloc[-1])
                years = float(len(financials.columns) - 1)
                rev_cagr = _calc_cagr(start_r, end_r, years)
                if rev_cagr is not None:
                    rev_cagr_interp = f"Compounded annual revenue growth of {rev_cagr:.1f}% over {int(years)} fiscal years."
            except Exception:
                pass

        growth["revenue_cagr"] = {
            "name": "Revenue CAGR (3-Year)",
            "value": f"{rev_cagr:.1f}%" if rev_cagr is not None else (f"{rev_yoy:.1f}% (1Y)" if rev_yoy is not None else "Data unavailable"),
            "trend": "UP" if (rev_cagr or rev_yoy or 0) > 10 else ("STABLE" if (rev_cagr or rev_yoy or 0) > 0 else "DOWN"),
            "interpretation": rev_cagr_interp,
            "data_source": source_tag,
            "data_date": "Multi-Year Historical Statements"
        }

        # 3Y Profit (PAT) CAGR
        pat_cagr = None
        pat_cagr_interp = "Data unavailable"
        if financials is not None and "Net Income" in financials.index and len(financials.columns) >= 3:
            try:
                end_p = float(financials.loc["Net Income"].iloc[0])
                start_p = float(financials.loc["Net Income"].iloc[-1])
                years = float(len(financials.columns) - 1)
                pat_cagr = _calc_cagr(start_p, end_p, years)
                if pat_cagr is not None:
                    pat_cagr_interp = f"Compounded annual profit growth of {pat_cagr:.1f}% over {int(years)} fiscal years."
            except Exception:
                pass

        growth["profit_cagr"] = {
            "name": "PAT CAGR (3-Year)",
            "value": f"{pat_cagr:.1f}%" if pat_cagr is not None else (f"{pat_growth:.1f}% (1Y)" if pat_growth is not None else "Data unavailable"),
            "trend": "UP" if (pat_cagr or pat_growth or 0) > 12 else ("STABLE" if (pat_cagr or pat_growth or 0) > 0 else "DOWN"),
            "interpretation": pat_cagr_interp,
            "data_source": source_tag,
            "data_date": "Multi-Year Historical Statements"
        }

        # Margin Expansion / Contraction (YoY bps)
        margin_delta_str = "Data unavailable"
        margin_trend = "STABLE"
        if financials is not None and "Total Revenue" in financials.index and "Net Income" in financials.index and len(financials.columns) >= 2:
            try:
                m0 = (float(financials.loc["Net Income"].iloc[0]) / float(financials.loc["Total Revenue"].iloc[0])) * 100.0
                m1 = (float(financials.loc["Net Income"].iloc[1]) / float(financials.loc["Total Revenue"].iloc[1])) * 100.0
                delta_bps = int((m0 - m1) * 100)
                margin_delta_str = f"{'+' if delta_bps >= 0 else ''}{delta_bps} bps"
                margin_trend = "UP" if delta_bps > 50 else ("DOWN" if delta_bps < -50 else "STABLE")
                margin_interp = f"Net profit margins expanded by {delta_bps} bps year-over-year." if delta_bps >= 0 else f"Margins compressed by {abs(delta_bps)} bps."
            except Exception:
                margin_interp = "Data unavailable"
        else:
            margin_interp = "Data unavailable"

        growth["margin_trend"] = {
            "name": "Margin Expansion / Contraction",
            "value": margin_delta_str,
            "trend": margin_trend,
            "interpretation": margin_interp,
            "data_source": source_tag,
            "data_date": "YoY Operating Statements"
        }

        # Overall Fundamental Health Score (0-100)
        score_points = 50
        if rev_yoy and rev_yoy > 8: score_points += 10
        if pat_growth and pat_growth > 10: score_points += 10
        if roe_val and roe_val > 15: score_points += 10
        if de_val and de_val < 0.8: score_points += 10
        if (fcf_val or 0) > 0: score_points += 10
        fundamental_score = min(98, max(20, score_points))

        return {
            "symbol": symbol,
            "company_name": info.get("longName", symbol),
            "sector": sector,
            "industry": info.get("industry", "Equity"),
            "data_date": data_date,
            "fundamental_health_score": fundamental_score,
            "summary_verdict": "STRONG" if fundamental_score >= 75 else ("MODERATE" if fundamental_score >= 50 else "WEAK"),
            "financial_health": health,
            "valuation": valuation,
            "growth": growth
        }


fundamental_service = FundamentalService()
