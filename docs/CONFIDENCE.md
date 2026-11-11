# Signal Confidence Score Specification

> **RULE / LEGAL NOTICE**:
> **Signal confidence is an index of deterministic rule consensus and market data quality.**
> **It is NOT a statistical win probability, backtested hit rate, or guarantee of financial returns.**
> **Trading Indian equities involves substantial risk of loss. Never risk capital you cannot afford to lose.**

---

## 1. Overview & Core Principles

The AI Stock Platform generates trading signals exclusively from deterministic quantitative indicators calculated over real market bars from the National Stock Exchange (NSE).

In accordance with platform governance:
1. **No Invented Probabilities**: The system never outputs a pseudo-scientific "win probability" (e.g. 78% win chance) because market dynamics cannot be reduced to static Bernoulli trials.
2. **Deterministic & Transparent**: Every point in the confidence score corresponds to an auditable rule or data completeness check.
3. **Bounded Scale**: Confidence scores range from **40 to 100 points** for any valid generated signal. Signals scoring below 50 are withheld or classified as `HOLD`.

---

## 2. Mathematical Formulation

The total Confidence Score \(C\) is computed as the sum of three explicit components:

\[
C = C_{\text{base}} + C_{\text{data}} + C_{\text{rules}}
\]

Where:
- \(C_{\text{base}} = 40\) (Baseline floor for a valid, qualified asset)
- \(C_{\text{data}} \in [0, 20]\) (Data completeness & history depth)
- \(C_{\text{rules}} \in [0, 40]\) (Deterministic rule consensus)

Maximum Possible Score: \(40 + 20 + 40 = 100\).

---

## 3. Component Breakdown

### 3.1 Base Floor (\(C_{\text{base}} = 40\))
- Signals are only evaluated for actively traded equities with real volume.
- A qualified evaluation begins at 40 points.

### 3.2 Data Completeness & History Depth (\(C_{\text{data}} \le 20\) points)

High quality quantitative analysis requires sufficient sample depth for moving averages and volatility estimates:

| Criterion | Requirement | Points Awarded |
|---|---|---|
| **Bar History Depth** | \(\ge 200\) daily bars available | **+10 pts** |
| | \(50\) to \(199\) daily bars available | **+5 pts** |
| | \(< 50\) daily bars available | **0 pts** |
| **Indicator Completeness** | All 6 primary indicators computable: RSI(14), ATR(14), SMA(20), SMA(50), MACD(12,26,9), 20-day Volume SMA | **+10 pts** |
| | 4 or 5 indicators computable | **+5 pts** |
| | \(< 4\) indicators computable | **0 pts** |

### 3.3 Rule Agreement Consensus (\(C_{\text{rules}} \le 40\) points)

Five independent deterministic quantitative rules are evaluated. Points are awarded based on consensus:

#### The 5 Deterministic Rules:
1. **Trend Structure Rule**:
   - *BUY*: \(\text{Price} > \text{SMA}_{20} > \text{SMA}_{50}\)
   - *SELL*: \(\text{Price} < \text{SMA}_{20} < \text{SMA}_{50}\)
   - *Score*: **+10 pts** if aligned.
2. **Momentum (RSI-14) Rule**:
   - *BUY*: \(40 \le \text{RSI} \le 65\) (positive momentum without extreme overbought exhaustion)
   - *SELL*: \(35 \le \text{RSI} \le 60\) (negative momentum without extreme oversold bounce risk)
   - *Score*: **+10 pts** if aligned.
3. **MACD Momentum Confirmation Rule**:
   - *BUY*: \(\text{MACD Line} > \text{Signal Line}\) and \(\text{Histogram} > 0\)
   - *SELL*: \(\text{MACD Line} < \text{Signal Line}\) and \(\text{Histogram} < 0\)
   - *Score*: **+10 pts** if aligned.
4. **Volume Surge Confirmation Rule**:
   - Current or latest bar volume \(\ge 1.05 \times\) 20-day average volume (\(\text{vol\_surge} \ge 1.05\)).
   - *Score*: **+5 pts** if confirmed.
5. **Volatility & ATR Liquidity Room Rule**:
   - \(\text{ATR}_{14} \ge 0.5\%\) of price (ensures sufficient volatility for target attainment, avoiding illiquid/flat price action).
   - *Score*: **+5 pts** if satisfied.

---

## 4. Signal Type Derivation

| Consensus Agreement | Resulting Signal | Base + Consensus Range |
|---|---|---|
| \(\ge 4\) Rules Agree Bullish | **BUY** | **70 – 100** |
| \(\ge 4\) Rules Agree Bearish | **SELL** | **70 – 100** |
| 3 Rules Agree (Moderate Consensus) | **BUY** or **SELL** | **55 – 69** |
| \(< 3\) Rules Agree | **HOLD** (No directional edge) | **40 – 54** |

---

## 5. ATR Stop Loss & Target Calculation

Targets and stops are strictly anchored to the 14-day Average True Range (ATR) with a minimum 2:1 Reward-to-Risk ratio:

- **BUY Signal**:
  - Entry Price: Traded market price (or next-day open if after 15:30 IST)
  - \(\text{Stop Loss} = \text{Entry} - 1.5 \times \text{ATR}_{14}\)
  - \(\text{Target Price} = \text{Entry} + 3.0 \times \text{ATR}_{14}\)
- **SELL Signal**:
  - Entry Price: Traded market price (or next-day open if after 15:30 IST)
  - \(\text{Stop Loss} = \text{Entry} + 1.5 \times \text{ATR}_{14}\)
  - \(\text{Target Price} = \text{Entry} - 3.0 \times \text{ATR}_{14}\)

---

## 6. Audit Trail & Metadata Stored

Every signal record persisted in the platform database stores:
- `rule_version`: Constant rule engine identifier (e.g. `v1.0-deterministic-quant`)
- `source`: Source of market data (e.g. `yfinance`)
- `as_of`: ISO timestamp of market snapshot used for indicator generation
- `confidence_pct`: Computed integer score \([40, 100]\)
- `model_breakdown`: JSON detailing points awarded per rule and indicator values

