"""Watch resting paper orders and forward authenticated Kite trade observations."""

import asyncio
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
import logging
from urllib.parse import urlsplit

import httpx
from sqlalchemy import text

from auth.security import create_access_token
from config import settings
from db.session import SessionLocal
from services.broker_service import (
    UserKiteCredentials,
    expire_quote_session_if_current,
    resolve_user_kite_credentials,
)
from services.kite_ws_collector import kite_ws_collector

logger = logging.getLogger(__name__)
SUBSCRIPTION = "paper-orders"
REFRESH_SECONDS = 2


@dataclass
class PendingOrders:
    credentials: UserKiteCredentials
    instruments: set[tuple[str, str]]


@dataclass
class OrderWatch:
    instruments: set[tuple[str, str]]
    queue: asyncio.Queue
    task: asyncio.Task


def load_pending_orders() -> dict[str, PendingOrders]:
    with SessionLocal() as db:
        rows = db.execute(text(
            'SELECT DISTINCT user_id, exchange, symbol FROM "OrderLog" '
            "WHERE mode = 'PAPER' AND broker = 'PAPER' AND status = 'OPEN' "
            "AND order_type IN ('LIMIT', 'SL', 'SL_M', 'MARKET')"
        )).all()
        by_user = defaultdict(set)
        for user_id, exchange, symbol in rows:
            by_user[str(user_id)].add((exchange, symbol))
        pending = {}
        for user_id, instruments in by_user.items():
            credentials = resolve_user_kite_credentials(user_id, db)
            if credentials:
                pending[user_id] = PendingOrders(credentials, instruments)
        return pending


class PaperOrderWorker:
    def __init__(self, url: str, secret: str):
        parsed = urlsplit(url)
        local_http = parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1", "::1"}
        if not parsed.hostname or parsed.username or parsed.password or (parsed.scheme != "https" and not local_http):
            raise ValueError("PAPER_ORDER_EVALUATION_URL must use HTTPS or local HTTP.")
        if not secret or not secret.strip():
            raise ValueError("CRON_SECRET is required for the paper order worker.")
        self.url = url
        self.secret = secret
        self.watches: dict[str, OrderWatch] = {}
        self.retry_queue: asyncio.Queue[tuple[str, dict, int]] = asyncio.Queue(maxsize=1000)
        self.evaluator_healthy: bool = True
        self.last_evaluator_error: str | None = None

    @property
    def pending_retries(self) -> int:
        return self.retry_queue.qsize()

    async def run(self) -> None:
        async with httpx.AsyncClient(timeout=3.0, follow_redirects=False, trust_env=False) as client:
            retry_task = asyncio.create_task(self.drain_retries(client))
            try:
                while True:
                    try:
                        pending = await asyncio.to_thread(load_pending_orders)
                        await self.sync(pending, client)
                    except Exception as exc:
                        logger.warning("Paper order subscription refresh failed (%s).", type(exc).__name__)
                    await asyncio.sleep(REFRESH_SECONDS)
            finally:
                retry_task.cancel()
                await asyncio.gather(retry_task, return_exceptions=True)
                for user_id in list(self.watches):
                    await self.stop_watch(user_id)

    async def sync(self, pending: dict[str, PendingOrders], client: httpx.AsyncClient) -> None:
        for user_id in self.watches.keys() - pending.keys():
            await self.stop_watch(user_id)
        if pending:
            await kite_ws_collector.instruments.refresh_from_kite_csv()

        for user_id, group in pending.items():
            tokens = [
                token for exchange, symbol in group.instruments
                if (token := kite_ws_collector.instruments.get_token(symbol, exchange=exchange)) is not None
            ]
            if not tokens:
                await self.stop_watch(user_id)
                continue
            watch = self.watches.get(user_id)
            if watch is None:
                queue = kite_ws_collector.subscribe_stream(user_id)
                task = asyncio.create_task(self.consume(user_id, queue, client))
                watch = OrderWatch(group.instruments, queue, task)
                self.watches[user_id] = watch
            else:
                watch.instruments = group.instruments

            def on_expired(_user_id: str, credentials=group.credentials) -> None:
                asyncio.create_task(asyncio.to_thread(expire_quote_session_if_current, credentials))

            started, reason = await kite_ws_collector.start_user_collector(
                user_id,
                group.credentials.api_key,
                group.credentials.access_token,
                tokens,
                on_token_expired=on_expired,
                subscription=SUBSCRIPTION,
            )
            if not started:
                await self.stop_watch(user_id)
                logger.warning("Paper order quote subscription rejected: %s", reason)

    async def stop_watch(self, user_id: str) -> None:
        watch = self.watches.pop(user_id, None)
        if watch is None:
            return
        watch.task.cancel()
        await asyncio.gather(watch.task, return_exceptions=True)
        kite_ws_collector.unsubscribe_stream(user_id, watch.queue)
        await kite_ws_collector.release_subscription(user_id, SUBSCRIPTION)

    async def consume(self, user_id: str, queue: asyncio.Queue, client: httpx.AsyncClient) -> None:
        while True:
            tick = await queue.get()
            watch = self.watches[user_id]
            if (tick.get("exchange"), tick.get("symbol")) not in watch.instruments:
                continue
            if not tick.get("exchange_timestamp") or not tick.get("last_trade_timestamp"):
                continue
            payload = {key: tick[key] for key in (
                "symbol", "exchange", "price", "exchange_timestamp", "last_trade_timestamp"
            )}
            await self.forward_quote(client, user_id, payload)

    async def forward_quote(self, client: httpx.AsyncClient, user_id: str, payload: dict) -> None:
        token = create_access_token(user_id, timedelta(minutes=1))
        last_error = None
        for attempt in range(2):
            try:
                response = await client.post(
                    self.url,
                    json=payload,
                    headers={
                        "Authorization": f"Bearer {token}",
                        "X-Cron-Secret": self.secret,
                    },
                )
                response.raise_for_status()
                self.evaluator_healthy = True
                self.last_evaluator_error = None
                return
            except httpx.HTTPStatusError as exc:
                last_error = f"HTTP {exc.response.status_code}"
                if exc.response.status_code < 500:
                    logger.warning("Paper order quote rejected (HTTP %s).", exc.response.status_code)
                    return
            except httpx.RequestError as exc:
                last_error = f"RequestError: {type(exc).__name__}"
            if attempt == 0:
                await asyncio.sleep(0.25)

        self.evaluator_healthy = False
        self.last_evaluator_error = f"Evaluator unacknowledged: {last_error}"
        logger.warning("The paper order evaluator did not acknowledge a quote (%s). Queuing for recovery.", last_error)
        try:
            self.retry_queue.put_nowait((user_id, payload, 0))
        except asyncio.QueueFull:
            logger.warning("Paper order worker retry queue is full (1000 items). Oldest dropped.")

    async def drain_retries(self, client: httpx.AsyncClient) -> None:
        """Background worker draining unacknowledged quotes when the evaluator recovers."""
        while True:
            try:
                user_id, payload, attempts = await self.retry_queue.get()

                # Supported recovery freshness policy: Quotes older than 60 seconds are discarded
                # to prevent filling resting orders with stale, delayed ticks after prolonged downtime.
                exch_time_str = payload.get("exchange_timestamp")
                if exch_time_str:
                    try:
                        parsed_time = datetime.fromisoformat(exch_time_str.replace("Z", "+00:00"))
                        now_utc = datetime.now(timezone.utc)
                        age_sec = (now_utc - parsed_time).total_seconds()
                        if age_sec > 60:
                            logger.info(
                                "Recovery quote for %s expired (age %.1fs > 60s). Discarding stale quote.",
                                payload.get("symbol"),
                                age_sec,
                            )
                            self.retry_queue.task_done()
                            continue
                    except Exception:
                        pass

                token = create_access_token(user_id, timedelta(minutes=1))
                try:
                    response = await client.post(
                        self.url,
                        json=payload,
                        headers={
                            "Authorization": f"Bearer {token}",
                            "X-Cron-Secret": self.secret,
                        },
                    )
                    response.raise_for_status()
                    self.evaluator_healthy = True
                    self.last_evaluator_error = None
                    self.retry_queue.task_done()
                except (httpx.HTTPStatusError, httpx.RequestError) as exc:
                    self.evaluator_healthy = False
                    self.last_evaluator_error = f"Recovery attempt failed: {exc}"
                    self.retry_queue.task_done()
                    if attempts < 8:
                        delay = min(10.0, 0.5 * (2 ** attempts))
                        await asyncio.sleep(delay)
                        try:
                            self.retry_queue.put_nowait((user_id, payload, attempts + 1))
                        except asyncio.QueueFull:
                            pass
                    else:
                        logger.warning("Dropped quote for %s after %d retries.", payload.get("symbol"), attempts)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("Unexpected error in paper order retry drain: %s", exc)
                await asyncio.sleep(1.0)
