"""
Zerodha Kite WebSocket Binary Tick Collector & Instrument Mapper.

Architecture & Guarantees:
- Implements Kite Ticker v3 binary packet framing directly over `websockets` + `struct`
  (8B LTP, 44B Quote, 184B Full packets with exact `exchange_timestamp` & `last_trade_timestamp`).
- Credentials resolved exclusively server-side per authenticated user (`UserKiteCredentials`).
- Persistent collector with exponential-backoff reconnect, automatic resubscription,
  heartbeat timeout monitoring, and fail-fast `TOKEN_EXPIRED` state on auth rejection.
- Enforces Zerodha Kite subscription limits (max 3000 instruments/connection, max 3 connections/user).
- Duplicate and out-of-order tick filtering keyed by `(exchange_timestamp, last_price, volume)`.
- Bounded async tick queue (`MAX_QUEUE_SIZE = 2048`) to prevent memory exhaustion.
- Immediately updates hot tick cache & shared Redis (`ws:tick:...`) bypassing 10s REST cache.
"""

import asyncio
from datetime import datetime, timezone
import json
import logging
import struct
import threading
import time
from typing import Any, Callable, Dict, Iterable, List, Optional, Set, Tuple

import httpx
import websockets

logger = logging.getLogger("services.kite_ws")

KITE_WS_URL = "wss://ws.kite.trade"
KITE_INSTRUMENTS_NSE_URL = "https://api.kite.trade/instruments/NSE"
MAX_INSTRUMENTS_PER_CONNECTION = 3000
MAX_CONNECTIONS_PER_USER = 3
HEARTBEAT_TIMEOUT_SECONDS = 30.0
MAX_QUEUE_SIZE = 2048


def parse_kite_binary_message(payload: bytes) -> List[Dict[str, Any]]:
    """
    Decode Zerodha Kite WebSocket v3 binary frame into normalized tick dictionaries.
    Preserves exchange/last_trade Unix timestamps cleanly (never replaces with now()).
    """
    if not payload or len(payload) < 2:
        # 1-byte server heartbeat ping
        return []

    num_packets = struct.unpack(">H", payload[:2])[0]
    offset = 2
    ticks: List[Dict[str, Any]] = []

    for _ in range(num_packets):
        if offset + 2 > len(payload):
            break
        pkt_len = struct.unpack(">H", payload[offset:offset + 2])[0]
        offset += 2
        if offset + pkt_len > len(payload) or pkt_len < 8:
            break

        pkt = payload[offset:offset + pkt_len]
        offset += pkt_len

        instrument_token, last_price_raw = struct.unpack(">ii", pkt[:8])
        # Equity / index prices are scaled by 100 paise
        tick: Dict[str, Any] = {
            "instrument_token": instrument_token,
            "last_price": round(last_price_raw / 100.0, 2),
            "mode": "ltp",
            "last_trade_timestamp": None,
            "exchange_timestamp": None,
            "volume": None,
            "open": None,
            "high": None,
            "low": None,
            "close": None,
            "change_percent": None,
        }

        if pkt_len >= 44:
            (
                last_qty,
                avg_price_raw,
                volume_traded,
                total_buy_qty,
                total_sell_qty,
                open_raw,
                high_raw,
                low_raw,
                close_raw,
            ) = struct.unpack(">iiiiiiiii", pkt[8:44])

            prev_close = round(close_raw / 100.0, 2)
            chg_pct = (
                round(((tick["last_price"] - prev_close) / prev_close) * 100.0, 2)
                if prev_close > 0
                else None
            )
            tick.update({
                "mode": "quote",
                "last_traded_quantity": last_qty,
                "average_traded_price": round(avg_price_raw / 100.0, 2),
                "volume": volume_traded,
                "total_buy_quantity": total_buy_qty,
                "total_sell_quantity": total_sell_qty,
                "open": round(open_raw / 100.0, 2),
                "high": round(high_raw / 100.0, 2),
                "low": round(low_raw / 100.0, 2),
                "close": prev_close,
                "change_percent": chg_pct,
            })

        if pkt_len >= 184:
            ltt_ts, oi, oi_high, oi_low, exch_ts = struct.unpack(">iiiii", pkt[44:64])
            tick["mode"] = "full"
            tick["oi"] = oi
            tick["oi_day_high"] = oi_high
            tick["oi_day_low"] = oi_low
            tick["last_trade_timestamp"] = (
                datetime.fromtimestamp(ltt_ts, tz=timezone.utc).isoformat() if ltt_ts > 0 else None
            )
            tick["exchange_timestamp"] = (
                datetime.fromtimestamp(exch_ts, tz=timezone.utc).isoformat() if exch_ts > 0 else None
            )

        ticks.append(tick)

    return ticks


class InstrumentRegistry:
    """Thread-safe NSE symbol <-> Kite instrument_token lookup with CSV refresh."""

    def __init__(self):
        self._lock = threading.Lock()
        self._symbol_to_token: Dict[str, int] = {}
        self._token_to_symbol: Dict[int, str] = {}
        self._last_loaded_at: float = 0.0

    def register(self, symbol: str, instrument_token: int, exchange: str = "NSE") -> None:
        sym = f"{exchange.upper()}:{symbol.strip().upper().replace('.NS', '')}"
        with self._lock:
            self._symbol_to_token[sym] = int(instrument_token)
            self._token_to_symbol[int(instrument_token)] = sym

    def get_token(self, symbol: str, exchange: str = "NSE") -> Optional[int]:
        sym = f"{exchange.upper()}:{symbol.strip().upper().replace('.NS', '')}"
        with self._lock:
            return self._symbol_to_token.get(sym)

    def get_symbol(self, instrument_token: int) -> Optional[str]:
        with self._lock:
            return self._token_to_symbol.get(int(instrument_token))

    async def refresh_from_kite_csv(self) -> int:
        """Fetch official public NSE instruments CSV from Kite and populate lookup table."""
        now = time.monotonic()
        if self._token_to_symbol and (now - self._last_loaded_at) < 43200:
            return len(self._token_to_symbol)

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(KITE_INSTRUMENTS_NSE_URL)
            resp.raise_for_status()
            lines = resp.text.splitlines()

        if len(lines) < 2:
            return 0

        loaded = 0
        new_s2t: Dict[str, int] = {}
        new_t2s: Dict[int, str] = {}
        header = lines[0].split(",")
        try:
            idx_token = header.index("instrument_token")
            idx_symbol = header.index("tradingsymbol")
            idx_ex = header.index("exchange")
        except ValueError:
            return 0

        for line in lines[1:]:
            parts = line.split(",")
            if len(parts) <= max(idx_token, idx_symbol, idx_ex):
                continue
            try:
                token = int(parts[idx_token])
            except ValueError:
                continue
            tsym = parts[idx_symbol].strip().upper()
            ex = parts[idx_ex].strip().upper()
            key = f"{ex}:{tsym}"
            new_s2t[key] = token
            new_t2s[token] = key
            loaded += 1

        with self._lock:
            self._symbol_to_token.update(new_s2t)
            self._token_to_symbol.update(new_t2s)
            self._last_loaded_at = now
        return loaded


class KiteWebSocketCollector:
    """
    Per-user managed Kite WebSocket collector with hot tick storage, Redis publishing,
    deduplication, entitlement limits, and reconnect/expiry state machine.
    """

    def __init__(self, cache_layer=None):
        self.instruments = InstrumentRegistry()
        self._cache = cache_layer
        self._lock = threading.Lock()
        # key: (user_id, exchange:symbol) -> latest normalized quote dict
        self._latest_ticks: Dict[Tuple[str, str], Dict[str, Any]] = {}
        # key: (user_id, exchange:symbol) -> (exchange_ts_iso, last_price, volume)
        self._dedup_state: Dict[Tuple[str, str], Tuple[Optional[str], float, Optional[int]]] = {}
        # key: user_id -> connection metadata
        self._connections: Dict[str, Dict[str, Any]] = {}
        self._tasks: Dict[str, asyncio.Task] = {}
        self._user_queues: Dict[str, asyncio.Queue] = {}
        self._subscribers: Dict[str, Set[asyncio.Queue]] = {}
        self._ticks_accepted: int = 0
        self._ticks_dropped: int = 0
        self._ticks_duplicate_or_ooo: int = 0
        self._last_tick_received_at: Optional[str] = None

    def get_latest_tick(self, user_id: str, symbol: str, exchange: str = "NSE") -> Optional[Dict[str, Any]]:
        """Read immediate latest WS tick bypassing 10s REST cache."""
        clean = symbol.strip().upper().replace(".NS", "")
        key = (str(user_id), f"{exchange.upper()}:{clean}")
        with self._lock:
            tick = self._latest_ticks.get(key)
            if tick:
                return dict(tick)

        redis_client = getattr(self._cache, "_redis", None)
        if redis_client is not None:
            try:
                raw = redis_client.get(f"ws:tick:{user_id}:{exchange.upper()}:{clean}")
                if raw:
                    return json.loads(raw)
            except Exception:
                pass
        return None

    def get_connection_state(self, user_id: str) -> str:
        with self._lock:
            meta = self._connections.get(str(user_id))
            return meta["state"] if meta else "DISCONNECTED"

    def process_tick(self, user_id: str, raw_tick: Dict[str, Any]) -> Tuple[bool, Optional[Dict[str, Any]]]:
        """
        Validate, deduplicate, and store an incoming decoded WS tick immediately.
        Returns (accepted, normalized_quote_or_none).
        """
        token = raw_tick.get("instrument_token")
        sym_key = raw_tick.get("symbol_key") or (self.instruments.get_symbol(token) if token else None)
        if not sym_key:
            return False, None

        exchange, clean_symbol = sym_key.split(":", 1) if ":" in sym_key else ("NSE", sym_key)
        state_key = (str(user_id), sym_key)
        exch_ts = raw_tick.get("exchange_timestamp") or raw_tick.get("last_trade_timestamp")
        last_price = float(raw_tick["last_price"])
        volume = raw_tick.get("volume")
        received_at = datetime.now(timezone.utc).isoformat()

        with self._lock:
            prev = self._dedup_state.get(state_key)
            if prev is not None:
                prev_ts, prev_price, prev_vol = prev
                # Reject strictly older exchange timestamps (out-of-order packet)
                if prev_ts and exch_ts and exch_ts < prev_ts:
                    self._ticks_duplicate_or_ooo += 1
                    return False, None
                # Reject identical duplicate tick for same timestamp/price/volume
                if exch_ts and prev_ts == exch_ts and prev_price == last_price and prev_vol == volume:
                    self._ticks_duplicate_or_ooo += 1
                    return False, None

            self._dedup_state[state_key] = (exch_ts, last_price, volume)
            normalized = {
                "symbol": clean_symbol,
                "exchange": exchange,
                "price": last_price,
                "open": raw_tick.get("open"),
                "high": raw_tick.get("high"),
                "low": raw_tick.get("low"),
                "prev_close": raw_tick.get("close"),
                "change_percent": raw_tick.get("change_percent"),
                "volume": volume,
                "exchange_timestamp": raw_tick.get("exchange_timestamp"),
                "last_trade_timestamp": raw_tick.get("last_trade_timestamp"),
                "as_of": exch_ts,
                "received_at": received_at,
                "source": "kite_ws",
                "entitlement": f"user:{user_id}:kite",
                "is_realtime": True,
                "instrument_token": token,
            }
            self._latest_ticks[state_key] = normalized
            self._ticks_accepted += 1
            self._last_tick_received_at = received_at
            listeners = list(self._subscribers.get(str(user_id), ()))

        # Write immediately to Redis hot tick cache (short 120s TTL) bypassing 10s REST cache
        redis_client = getattr(self._cache, "_redis", None)
        if redis_client is not None:
            try:
                redis_client.setex(
                    f"ws:tick:{user_id}:{exchange}:{clean_symbol}",
                    120,
                    json.dumps(normalized),
                )
            except Exception:
                pass

        for q in listeners:
            if q.full():
                try:
                    q.get_nowait()
                    with self._lock:
                        self._ticks_dropped += 1
                except asyncio.QueueEmpty:
                    pass
            try:
                q.put_nowait(normalized)
            except asyncio.QueueFull:
                with self._lock:
                    self._ticks_dropped += 1

        return True, normalized

    def subscribe_stream(self, user_id: str) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=MAX_QUEUE_SIZE)
        with self._lock:
            self._subscribers.setdefault(str(user_id), set()).add(q)
        return q

    def unsubscribe_stream(self, user_id: str, q: asyncio.Queue) -> None:
        with self._lock:
            s = self._subscribers.get(str(user_id))
            if s:
                s.discard(q)
                if not s:
                    self._subscribers.pop(str(user_id), None)

    def can_subscribe_tokens(self, tokens: Iterable[int], active_conns_for_user: int = 1) -> Tuple[bool, Optional[str]]:
        token_list = list(tokens)
        if active_conns_for_user > MAX_CONNECTIONS_PER_USER:
            return False, f"Exceeds Kite limit of {MAX_CONNECTIONS_PER_USER} active WebSocket connections per user."
        if len(token_list) > MAX_INSTRUMENTS_PER_CONNECTION:
            return False, f"Exceeds Kite limit of {MAX_INSTRUMENTS_PER_CONNECTION} instruments per connection."
        return True, None

    async def start_user_collector(
        self,
        user_id: str,
        api_key: str,
        access_token: str,
        tokens: List[int],
        mode: str = "full",
        on_token_expired: Optional[Callable[[str], None]] = None,
    ) -> Tuple[bool, Optional[str]]:
        """Start or update an authenticated persistent Kite WebSocket collector task for a user."""
        ok, err = self.can_subscribe_tokens(tokens)
        if not ok:
            return False, err

        uid = str(user_id)
        with self._lock:
            existing = self._tasks.get(uid)
            if existing and not existing.done():
                self._connections[uid]["tokens"] = list(tokens)
                return True, None

            self._connections[uid] = {
                "state": "CONNECTING",
                "tokens": list(tokens),
                "mode": mode,
                "last_heartbeat": time.monotonic(),
                "error": None,
            }
            task = asyncio.create_task(
                self._run_loop(uid, api_key, access_token, mode, on_token_expired)
            )
            self._tasks[uid] = task
        return True, None

    async def stop_user_collector(self, user_id: str) -> None:
        uid = str(user_id)
        with self._lock:
            task = self._tasks.pop(uid, None)
            if uid in self._connections:
                self._connections[uid]["state"] = "DISCONNECTED"
        if task:
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass

    async def _run_loop(
        self,
        user_id: str,
        api_key: str,
        access_token: str,
        mode: str,
        on_token_expired: Optional[Callable[[str], None]],
    ) -> None:
        ws_uri = f"{KITE_WS_URL}?api_key={api_key}&access_token={access_token}"
        backoff = 1.0

        while True:
            with self._lock:
                meta = self._connections.get(user_id)
                if not meta or meta["state"] in ("DISCONNECTED", "TOKEN_EXPIRED"):
                    return
                tokens = list(meta["tokens"])

            try:
                async with websockets.connect(
                    ws_uri,
                    ping_interval=15,
                    ping_timeout=15,
                    max_size=2**20,
                ) as ws:
                    with self._lock:
                        self._connections[user_id]["state"] = "CONNECTED"
                        self._connections[user_id]["error"] = None
                        self._connections[user_id]["last_heartbeat"] = time.monotonic()
                    backoff = 1.0

                    if tokens:
                        await ws.send(json.dumps({"a": "subscribe", "v": tokens}))
                        await ws.send(json.dumps({"a": "mode", "v": [mode, tokens]}))

                    while True:
                        msg = await asyncio.wait_for(ws.recv(), timeout=HEARTBEAT_TIMEOUT_SECONDS)
                        with self._lock:
                            self._connections[user_id]["last_heartbeat"] = time.monotonic()

                        if isinstance(msg, bytes):
                            for parsed in parse_kite_binary_message(msg):
                                self.process_tick(user_id, parsed)
                        elif isinstance(msg, str):
                            try:
                                event = json.loads(msg)
                                if event.get("type") == "error" and (
                                    "token" in str(event.get("data", "")).lower()
                                    or "403" in str(event.get("data", ""))
                                ):
                                    raise PermissionError("Kite token expired or invalid")
                            except ValueError:
                                pass
            except asyncio.CancelledError:
                raise
            except (PermissionError, websockets.exceptions.InvalidStatus) as exc:
                status_code = getattr(getattr(exc, "response", None), "status_code", None)
                if isinstance(exc, PermissionError) or status_code in (401, 403):
                    with self._lock:
                        if user_id in self._connections:
                            self._connections[user_id]["state"] = "TOKEN_EXPIRED"
                            self._connections[user_id]["error"] = "Kite access token expired or revoked."
                    if on_token_expired:
                        on_token_expired(user_id)
                    return
                logger.warning("[KiteWS user=%s] Connection rejected (%s); retrying in %.1fs", user_id, exc, backoff)
            except Exception as exc:
                logger.warning("[KiteWS user=%s] Stream disconnected (%s); retrying in %.1fs", user_id, exc, backoff)
                with self._lock:
                    if user_id in self._connections and self._connections[user_id]["state"] != "TOKEN_EXPIRED":
                        self._connections[user_id]["state"] = "RECONNECTING"
                        self._connections[user_id]["error"] = str(exc)

            await asyncio.sleep(backoff)
            backoff = min(60.0, backoff * 2.0)

    def get_health_summary(self) -> Dict[str, Any]:
        with self._lock:
            states = {uid: meta["state"] for uid, meta in self._connections.items()}
            active = sum(1 for s in states.values() if s == "CONNECTED")
            return {
                "active_connections": active,
                "connection_states": states,
                "last_tick_at": self._last_tick_received_at,
                "ticks_accepted": self._ticks_accepted,
                "ticks_dropped": self._ticks_dropped,
                "ticks_duplicate_or_ooo": self._ticks_duplicate_or_ooo,
                "cached_instruments": len(self.instruments._token_to_symbol),
            }


kite_ws_collector = KiteWebSocketCollector()

