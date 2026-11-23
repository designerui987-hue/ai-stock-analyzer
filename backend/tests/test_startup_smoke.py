"""
Startup smoke test: verify full import of FastAPI app and core services.
Catches any unimported type annotations (e.g. `Any` on Python 3.12) or syntax/circular import errors.
"""

def test_app_startup_import():
    import main
    from services.portfolio_service import PortfolioService
    from services.market_data_service import MarketDataService, UpstoxMarketDataProvider
    from services.research_snapshot_service import ResearchSnapshotService
    assert main.app is not None
    assert PortfolioService is not None
    assert MarketDataService is not None
