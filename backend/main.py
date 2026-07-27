from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from api import stocks, portfolio, assistant, alerts, market, auth
from config import settings
from db.session import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 AI Stock Platform Backend Starting...")
    print(f"📊 Live data: {'Enabled' if settings.has_live_data else 'Demo mode'}")
    init_db()
    yield
    print("👋 Shutting down...")


app = FastAPI(
    title="AI Stock Market Analysis Platform",
    description="AI-powered stock analysis and recommendations for Indian investors",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(market.router, prefix="/api/market", tags=["Market"])
app.include_router(stocks.router, prefix="/api/stocks", tags=["Stocks"])
app.include_router(portfolio.router, prefix="/api/portfolio", tags=["Portfolio"])
app.include_router(assistant.router, prefix="/api/assistant", tags=["AI Assistant"])
app.include_router(alerts.router, prefix="/api/alerts", tags=["Alerts"])
app.include_router(auth.router)


@app.get("/")
async def root():
    return {"message": "AI Stock Platform API", "version": "1.0.0", "status": "running"}


@app.get("/health")
async def health():
    return {"status": "healthy", "live_data": settings.has_live_data}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
