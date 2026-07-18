"""AI Assistant chat API endpoint."""

from fastapi import APIRouter
from models.analysis import ChatRequest
from data.demo_stocks import NIFTY50_STOCKS
from ai_models.prediction_engine import prediction_engine

router = APIRouter()


def generate_ai_response(message: str) -> dict:
    """Generate an AI response based on the user's message."""
    msg_lower = message.lower()
    referenced_stocks = []

    # Check if user is asking about a specific stock
    for symbol, data in NIFTY50_STOCKS.items():
        if symbol.lower() in msg_lower or data["name"].lower().split()[0].lower() in msg_lower:
            referenced_stocks.append(symbol)

    if referenced_stocks:
        stock_sym = referenced_stocks[0]
        stock = NIFTY50_STOCKS[stock_sym]
        pred = prediction_engine.predict(stock_sym)

        if "buy" in msg_lower or "should i" in msg_lower or "invest" in msg_lower:
            response = (
                f"📊 **{stock['name']} ({stock_sym}) Analysis**\n\n"
                f"Current Price: ₹{stock['price']:.2f} ({stock['change_pct']:+.2f}%)\n\n"
                f"🤖 **AI Signal: {pred['signal']}** (Confidence: {pred['confidence']}%)\n\n"
                f"**Key Metrics:**\n"
                f"- Risk Score: {pred['risk_score']}/10\n"
                f"- Entry Price: ₹{pred['entry_price']:.2f}\n"
                f"- Target Exit: ₹{pred['exit_price']:.2f}\n"
                f"- Stop Loss: ₹{pred['stop_loss']:.2f}\n"
                f"- Profit Probability: {pred['profit_probability']}%\n\n"
                f"**AI Explanation:**\n{pred['explanation']}\n\n"
                f"⚠️ *This is AI-generated analysis for educational purposes. Always do your own research and consult a financial advisor.*"
            )
        elif "analyze" in msg_lower or "analysis" in msg_lower:
            response = (
                f"📈 **Detailed Analysis: {stock['name']} ({stock_sym})**\n\n"
                f"**Price:** ₹{stock['price']:.2f} | **Change:** {stock['change_pct']:+.2f}%\n"
                f"**P/E Ratio:** {stock['pe_ratio']} | **Market Cap:** {stock['market_cap']}\n"
                f"**52W Range:** ₹{stock['week52_low']:.2f} - ₹{stock['week52_high']:.2f}\n\n"
                f"🤖 **AI Signal: {pred['signal']}** ({pred['confidence']}% confidence)\n\n"
                f"**Analysis Factors:**\n"
            )
            for factor in pred["factors"][:5]:
                response += f"- {factor}\n"
            response += f"\n{pred['explanation']}"
        else:
            response = (
                f"Here's a quick look at **{stock['name']}** ({stock_sym}):\n\n"
                f"- Price: ₹{stock['price']:.2f} ({stock['change_pct']:+.2f}%)\n"
                f"- AI Signal: **{pred['signal']}** ({pred['confidence']}% confidence)\n"
                f"- Sector: {stock['sector']}\n"
                f"- Market Cap: {stock['market_cap']}\n\n"
                f"Would you like a detailed analysis or buy/sell recommendation?"
            )

        suggestions = [
            f"Should I buy {stock_sym}?",
            f"Analyze {stock_sym} in detail",
            f"What's the risk for {stock_sym}?",
        ]
    elif "best" in msg_lower and ("stock" in msg_lower or "ai" in msg_lower):
        # Best stocks recommendation
        picks = []
        for sym in list(NIFTY50_STOCKS.keys())[:5]:
            pred = prediction_engine.predict(sym)
            if pred["signal"] == "BUY":
                picks.append((sym, pred))

        if picks:
            response = "🏆 **Top AI Stock Picks for Today:**\n\n"
            for sym, pred in sorted(picks, key=lambda x: x[1]["confidence"], reverse=True)[:5]:
                stock = NIFTY50_STOCKS[sym]
                response += (
                    f"**{sym}** ({stock['name']})\n"
                    f"- Signal: {pred['signal']} | Confidence: {pred['confidence']}%\n"
                    f"- Price: ₹{stock['price']:.2f} | Target: ₹{pred['exit_price']:.2f}\n\n"
                )
            referenced_stocks = [p[0] for p in picks]
        else:
            response = "The market is showing mixed signals today. No strong BUY recommendations at present. Consider holding existing positions and monitoring for breakout opportunities."

        suggestions = ["Analyze Reliance stock", "Show top losers", "What sectors are trending?"]
    elif "market" in msg_lower or "nifty" in msg_lower or "sensex" in msg_lower:
        response = (
            "📊 **Market Overview:**\n\n"
            "- **NIFTY 50:** 22,456.80 (+0.50%)\n"
            "- **SENSEX:** 73,987.45 (+0.51%)\n"
            "- **BANK NIFTY:** 47,234.60 (+0.50%)\n\n"
            "The market is showing positive momentum today with broad-based buying. "
            "IT and Banking sectors are leading the advance. FII buying continues to be supportive.\n\n"
            "Would you like analysis of any specific stock or sector?"
        )
        suggestions = ["Best stocks to buy today", "Analyze banking sector", "Show market heatmap"]
    elif "hello" in msg_lower or "hi" in msg_lower or "hey" in msg_lower:
        response = (
            "👋 Hello! I'm your AI Stock Market Assistant.\n\n"
            "I can help you with:\n"
            "- 📊 **Stock Analysis:** Ask about any NIFTY 50 stock\n"
            "- 🤖 **Buy/Sell Signals:** Get AI-powered recommendations\n"
            "- 📈 **Market Overview:** Current market conditions\n"
            "- 💼 **Portfolio Advice:** Investment suggestions\n\n"
            "Try asking: *\"Should I buy Reliance?\"* or *\"Analyze TCS stock\"*"
        )
        suggestions = ["Should I buy Reliance?", "Analyze TCS stock", "Best AI stocks in India"]
    else:
        response = (
            "I'm here to help with stock market analysis! Here are some things you can ask:\n\n"
            "- **\"Should I buy [stock]?\"** – Get AI buy/sell recommendation\n"
            "- **\"Analyze [stock]\"** – Detailed stock analysis\n"
            "- **\"Best stocks to buy\"** – Top AI picks\n"
            "- **\"Market overview\"** – Current market status\n\n"
            "I cover all major NIFTY 50 stocks. Try asking about any Indian stock!"
        )
        suggestions = ["Should I buy Reliance?", "Analyze TCS", "Market overview"]

    return {
        "response": response,
        "suggestions": suggestions,
        "referenced_stocks": referenced_stocks,
    }


@router.post("/chat")
async def chat(request: ChatRequest):
    """Chat with the AI assistant."""
    return generate_ai_response(request.message)
