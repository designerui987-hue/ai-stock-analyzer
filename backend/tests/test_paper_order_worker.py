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


def test_load_pending_orders_includes_stop_loss_only_accounts(monkeypatch):
    """Test that stop-loss-only accounts (SL / SL_M) are discovered by load_pending_orders."""
    class FakeResult:
        def all(self):
            return [
                ("user-sl-only", "NSE", "RELIANCE"),
                ("user-limit-and-sl", "NSE", "INFY"),
            ]

    class FakeSession:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def execute(self, statement):
            stmt_text = str(statement)
            assert "order_type IN ('LIMIT', 'SL', 'SL_M', 'MARKET')" in stmt_text
            return FakeResult()

    monkeypatch.setattr(paper_order_worker, "SessionLocal", lambda: FakeSession())
    monkeypatch.setattr(
        paper_order_worker,
        "resolve_user_kite_credentials",
        lambda uid, db: UserKiteCredentials(uid, "k", "t", None, "CONNECTED"),
    )

    pending = paper_order_worker.load_pending_orders()
    assert "user-sl-only" in pending
    assert ("NSE", "RELIANCE") in pending["user-sl-only"].instruments
    assert "user-limit-and-sl" in pending
    assert ("NSE", "INFY") in pending["user-limit-and-sl"].instruments


def test_recovery_policy_discards_expired_quotes_older_than_60s():
    """Verify that delayed replay quotes older than 60s are dropped during recovery."""
    async def exercise():
        forwarded = []

        def receive_quote(request):
            forwarded.append(json.loads(request.content))
            return httpx.Response(200)

        worker = paper_order_worker.PaperOrderWorker("http://localhost/api/broker/orders/evaluate", "service-secret")

        # Put an expired quote (> 60s old) into the retry queue
        expired_payload = {
            "symbol": "TCS",
            "exchange": "NSE",
            "price": 3500.0,
            "exchange_timestamp": "2026-11-18T04:00:00+00:00",  # over 1 hour old
            "last_trade_timestamp": "2026-11-18T04:00:00+00:00",
        }
        worker.retry_queue.put_nowait(("user-1", expired_payload, 0))

        # Put a fresh quote into the retry queue
        fresh_payload = {
            "symbol": "INFY",
            "exchange": "NSE",
            "price": 1850.0,
            "exchange_timestamp": paper_order_worker.datetime.now(paper_order_worker.timezone.utc).isoformat(),
            "last_trade_timestamp": paper_order_worker.datetime.now(paper_order_worker.timezone.utc).isoformat(),
        }
        worker.retry_queue.put_nowait(("user-1", fresh_payload, 0))

        async with httpx.AsyncClient(transport=httpx.MockTransport(receive_quote)) as client:
            drain_task = asyncio.create_task(worker.drain_retries(client))
            await worker.retry_queue.join()
            drain_task.cancel()
            await asyncio.gather(drain_task, return_exceptions=True)

        assert len(forwarded) == 1
        assert forwarded[0]["symbol"] == "INFY"

    asyncio.run(exercise())

