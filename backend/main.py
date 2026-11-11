from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from api import stocks, portfolio, assistant, alerts, market, auth, fundamentals, data_sources
from config import settings
from db.session import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("AI Stock Platform Backend Starting...")
    print(f"Live data: {'Enabled' if settings.has_live_data else 'Demo mode'}")
    print(f"CORS origins: {settings.cors_origin_list}")
    init_db()
    yield
    print("Shutting down...")


app = FastAPI(
    title="AI Stock Market Analysis Platform",
    description="AI-powered stock analysis and recommendations for Indian investors",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(market.router, prefix="/api/market", tags=["Market"])
app.include_router(stocks.router, prefix="/api/stocks", tags=["Stocks"])
app.include_router(fundamentals.router, prefix="/api/fundamentals", tags=["Fundamentals"])
app.include_router(data_sources.router, prefix="/api/data-sources", tags=["Data Sources"])
app.include_router(portfolio.router, prefix="/api/portfolio", tags=["Portfolio"])
app.include_router(assistant.router, prefix="/api/assistant", tags=["AI Assistant"])
app.include_router(alerts.router, prefix="/api/alerts", tags=["Alerts"])
app.include_router(auth.router)


@app.get("/")
async def root():
    return {"message": "AI Stock Platform API", "version": "1.0.0", "status": "running"}


@app.get("/health")
async def health():
    from services.kite_ws_collector import kite_ws_collector
    from services.market_data_service import market_data_service
    from services.nse_calendar import get_market_session

    ws_health = kite_ws_collector.get_health_summary()
    return {
        "status": "healthy",
        "live_data": bool(ws_health["active_connections"] > 0),
        "feed": {
            **ws_health,
            "kite_ws_enabled": settings.kite_ws_enabled,
            "kite_configured": settings.has_live_data,
            "redis_connected": market_data_service.cache.is_redis_connected,
            "market_session": get_market_session(),
        },
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
