import asyncio
import json
from unittest.mock import AsyncMock

import httpx

from auth.security import decode_jwt_token
from services import paper_order_worker
from services.broker_service import UserKiteCredentials
from services.kite_ws_collector import KiteWebSocketCollector


def test_resting_order_watch_uses_account_feed_and_keeps_watchlist(monkeypatch):
    async def exercise():
        collector = KiteWebSocketCollector(cache_layer=object())
        collector.instruments.register("RELIANCE", 101, "NSE")
        collector.instruments.register("TCS", 102, "NSE")
        monkeypatch.setattr(collector.instruments, "refresh_from_kite_csv", AsyncMock())
        monkeypatch.setattr(paper_order_worker, "kite_ws_collector", collector)

        async def wait_for_ticks(*args):
            await asyncio.Event().wait()

        monkeypatch.setattr(collector, "_run_loop", wait_for_ticks)
        await collector.start_user_collector("account-a", "key", "token", [102], subscription="watchlist")

        forwarded = []
        received = asyncio.Event()

        def receive_quote(request):
            forwarded.append((dict(request.headers), json.loads(request.content)))
            received.set()
            return httpx.Response(200)

        worker = paper_order_worker.PaperOrderWorker("http://localhost/api/broker/orders/evaluate", "service-secret")
        group = paper_order_worker.PendingOrders(
            UserKiteCredentials("account-a", "key", "token", None, "CONNECTED"),
            {("NSE", "RELIANCE")},
        )

        async with httpx.AsyncClient(transport=httpx.MockTransport(receive_quote)) as client:
            await worker.sync({"account-a": group}, client)
            assert collector._connections["account-a"]["tokens"] == {101, 102}
            tick = {
                "instrument_token": 101,
                "last_price": 2490,
                "exchange_timestamp": "2026-11-17T05:00:13+00:00",
            }
            collector.process_tick("account-a", tick)
            collector.process_tick("account-b", {**tick, "last_trade_timestamp": tick["exchange_timestamp"]})
            collector.process_tick("account-a", {
                **tick,
                "exchange_timestamp": "2026-11-17T05:00:14+00:00",
                "last_trade_timestamp": tick["exchange_timestamp"],
            })
            await asyncio.wait_for(received.wait(), timeout=1)
            assert len(forwarded) == 1
            headers, payload = forwarded[0]
            assert headers["x-cron-secret"] == "service-secret"
            assert decode_jwt_token(headers["authorization"].removeprefix("Bearer ")) == "account-a"
            assert payload == {
                "symbol": "RELIANCE",
                "exchange": "NSE",
                "price": 2490,
                "exchange_timestamp": "2026-11-17T05:00:14+00:00",
                "last_trade_timestamp": tick["exchange_timestamp"],
            }

            await worker.sync({}, client)
            assert collector._connections["account-a"]["tokens"] == {102}
            assert "account-a" not in collector._subscribers

        await collector.release_subscription("account-a", "watchlist")

    asyncio.run(exercise())
