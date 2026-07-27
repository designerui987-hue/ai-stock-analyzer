# 🚀 AI Stock Market Analysis Platform

An AI-powered stock market analysis platform for Indian investors. Get intelligent BUY/HOLD/SELL signals, portfolio insights, and chat with an AI assistant about stocks.

## Features

- 📊 **AI Stock Analysis** – Multi-model ensemble predictions with confidence scores
- 💼 **Portfolio Management** – Track holdings, P&L, and AI rebalancing suggestions
- 🤖 **AI Assistant** – Chat about stocks in plain English
- 📈 **Interactive Charts** – Candlestick charts with technical indicators
- 🔥 **Market Heatmap** – Sector-wise market visualization
- 🔔 **Smart Alerts** – Buy/sell/breakout/risk alerts
- 🧠 **AI Insights** – Daily AI-generated market insights

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Frontend | Next.js 14, React, TypeScript, TailwindCSS, Framer Motion |
| Backend | Python, FastAPI, Pydantic |
| AI/ML | PyTorch, Scikit-learn, XGBoost, LightGBM |
| Database | PostgreSQL, Redis |

## Quick Start

### Prerequisites
- Node.js 18+
- Python 3.10+

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000

### Docker (Full Stack)
```bash
docker-compose up --build
```

## Environment Variables

Copy `.env.example` to `.env` and add your API keys:

```
FINNHUB_API_KEY=your_key
TWELVEDATA_API_KEY=your_key
ALPHA_VANTAGE_API_KEY=your_key
OPENAI_API_KEY=your_key
```

The platform works with demo data by default — add keys to enable live data.

## Project Structure

```
ai-stock-platform/
├── frontend/          # Next.js 14 frontend
│   ├── app/           # App router pages
│   ├── components/    # React components
│   ├── lib/           # Utilities & API client
│   └── store/         # Zustand state
├── backend/           # FastAPI backend
│   ├── api/           # Route handlers
│   ├── models/        # Pydantic models
│   ├── services/      # Business logic
│   ├── ai_models/     # ML prediction engines
│   └── data/          # Demo data
└── docker/            # Docker configs
```

## License

MIT
