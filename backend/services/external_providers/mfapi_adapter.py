"""
MFapi Adapter — Optional Indian Mutual Fund Research & Historical NAV.

Official API: https://api.mfapi.in
Source: Community REST wrapper over AMFI India mutual fund NAV feeds.
Authentication: None required (fair use; caching recommended).
Freshness: NAV (Net Asset Value published after market close on business days).

CRITICAL WORKFLOW BOUNDARY:
NAV dates are kept explicit; NEVER assume today's date or use for intraday execution.
This module is optional research and NOT on the critical trading release path.
"""

import logging
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

from services.external_providers.base import (
    BaseAdapter,
    ProviderResponse,
    QuotaExhaustedError,
    make_unavailable,
)

logger = logging.getLogger("external_providers.mfapi")

PROVIDER_ID = "mfapi"
BASE_URL = "https://api.mfapi.in"


class MFAPIAdapter(BaseAdapter):
    """Indian mutual fund scheme search and historical NAV adapter."""

    provider_id = PROVIDER_ID
    cache_ttl_seconds = 3600
    caching_permitted = True

    def __init__(self, cache=None):
        super().__init__(quota_per_day=None, quota_per_minute=None, cache=cache)
        self.last_health = "healthy"
        self._scheme_list_cache: Optional[List[Dict[str, Any]]] = None
        self._scheme_list_fetched_at: float = 0.0

    @staticmethod
    def _parse_nav_date(date_str: Optional[str]) -> Optional[str]:
        """Parse DD-MM-YYYY NAV date to ISO8601 YYYY-MM-DD; return None if missing/invalid."""
        if not date_str:
            return None
        try:
            return datetime.strptime(str(date_str).strip(), "%d-%m-%Y").date().isoformat()
        except ValueError:
            return None

    def _get_scheme_list(self) -> List[Dict[str, Any]]:
        """Fallback in-process cache of full scheme list if /mf/search is stubbed in tests."""
        now = time.monotonic()
        if self._scheme_list_cache and (now - self._scheme_list_fetched_at) < 86400:
            return self._scheme_list_cache
        raw = self._make_request(f"{BASE_URL}/mf")
        if isinstance(raw, list):
            self._scheme_list_cache = raw
            self._scheme_list_fetched_at = now
            return raw
        return []

    def search_schemes(self, query: str, limit: int = 20, skip_cache: bool = False) -> ProviderResponse:
        """Search AMFI mutual fund schemes via MFapi native search endpoint."""
        clean_q = query.strip()
        if len(clean_q) < 2:
            return make_unavailable(PROVIDER_ID, "Search query must be at least 2 characters.")

        lim = max(1, min(int(limit), 50))
        cache_key = f"search:{clean_q.lower()}:{lim}"

        def _fetch() -> ProviderResponse:
            try:
                raw = self._make_request(f"{BASE_URL}/mf/search", params={"q": clean_q})
            except QuotaExhaustedError as exc:
                return make_unavailable(PROVIDER_ID, str(exc), status="quota_exhausted")
            except Exception as exc:
                logger.warning("[MFapi] search_schemes error: %s", exc)
                return make_unavailable(PROVIDER_ID, f"Scheme search failed: {exc}")

            if isinstance(raw, dict) and raw.get("status") == "ERROR":
                return make_unavailable(PROVIDER_ID, raw.get("message", "MFapi returned an error."))

            if not isinstance(raw, list):
                return make_unavailable(PROVIDER_ID, "Unexpected scheme search response format.")

            matched = [
                {
                    "schemeCode": item.get("schemeCode"),
                    "schemeName": item.get("schemeName"),
                }
                for item in raw
                if clean_q.lower() in str(item.get("schemeName", "")).lower()
            ][:lim]

            return ProviderResponse(
                provider_id=PROVIDER_ID,
                source=PROVIDER_ID,
                data={
                    "query": clean_q,
                    "results": matched,
                    "count": len(matched),
                    "disclaimer": (
                        "Optional mutual-fund research (AMFI data via MFapi.in). "
                        "NAV dates are explicit and end-of-day only."
                    ),
                },
                freshness="NAV",
                status="ok",
                source_url=f"{BASE_URL}/mf/search",
            )

        return self._cached_coalesced_fetch(cache_key, _fetch, skip_cache=skip_cache)

    def get_latest_nav(self, scheme_code: int, skip_cache: bool = False) -> ProviderResponse:
        """Fetch latest NAV with explicit NAV effective date."""
        if scheme_code <= 0:
            return make_unavailable(PROVIDER_ID, "Scheme code must be positive.", instrument=str(scheme_code))

        cache_key = f"latest:{scheme_code}"

        def _fetch() -> ProviderResponse:
            url = f"{BASE_URL}/mf/{scheme_code}/latest"
            try:
                raw = self._make_request(url)
            except QuotaExhaustedError as exc:
                return make_unavailable(PROVIDER_ID, str(exc), status="quota_exhausted", instrument=str(scheme_code))
            except Exception as exc:
                return make_unavailable(PROVIDER_ID, f"Request failed: {exc}", instrument=str(scheme_code))

            if isinstance(raw, dict) and raw.get("status") == "ERROR":
                return make_unavailable(
                    PROVIDER_ID,
                    raw.get("message", "MFapi returned an error."),
                    instrument=str(scheme_code),
                )

            meta = raw.get("meta") or {}
            rows = raw.get("data") or []
            if not rows:
                return make_unavailable(PROVIDER_ID, f"No NAV records for scheme {scheme_code}.", instrument=str(scheme_code))

            latest = rows[0]
            nav_date = self._parse_nav_date(latest.get("date"))
            if nav_date is None:
                return make_unavailable(
                    PROVIDER_ID,
                    f"NAV record for scheme {scheme_code} missing valid effective date.",
                    instrument=str(scheme_code),
                )

            try:
                nav_val = float(latest.get("nav"))
            except (TypeError, ValueError):
                return make_unavailable(PROVIDER_ID, f"Invalid NAV value for scheme {scheme_code}.", instrument=str(scheme_code))

            return ProviderResponse(
                provider_id=PROVIDER_ID,
                source=PROVIDER_ID,
                data={
                    "scheme_code": scheme_code,
                    "scheme_name": meta.get("scheme_name"),
                    "fund_house": meta.get("fund_house"),
                    "scheme_type": meta.get("scheme_type"),
                    "scheme_category": meta.get("scheme_category"),
                    "nav": nav_val,
                    "nav_date": nav_date,
                    "label": "NAV",
                    "disclaimer": (
                        "NAV is as of the explicit date shown — not real-time pricing. "
                        "Optional research module; not investment advice."
                    ),
                },
                instrument=str(scheme_code),
                currency="INR",
                unit="NAV per unit (INR)",
                observation_time=nav_date,
                freshness="NAV",
                status="ok",
                source_url=url,
            )

        return self._cached_coalesced_fetch(cache_key, _fetch, skip_cache=skip_cache)

    def get_nav_history(
        self, scheme_code: int, days: int = 90, skip_cache: bool = False
    ) -> ProviderResponse:
        """Fetch historical NAV series for a mutual fund scheme."""
        if scheme_code <= 0:
            return make_unavailable(PROVIDER_ID, "Scheme code must be positive.", instrument=str(scheme_code))

        days_clamped = max(1, min(int(days), 365))
        cache_key = f"history:{scheme_code}:{days_clamped}"

        def _fetch() -> ProviderResponse:
            url = f"{BASE_URL}/mf/{scheme_code}"
            try:
                raw = self._make_request(url)
            except QuotaExhaustedError as exc:
                return make_unavailable(PROVIDER_ID, str(exc), status="quota_exhausted", instrument=str(scheme_code))
            except Exception as exc:
                return make_unavailable(PROVIDER_ID, f"Request failed: {exc}", instrument=str(scheme_code))

            if isinstance(raw, dict) and raw.get("status") == "ERROR":
                return make_unavailable(
                    PROVIDER_ID,
                    raw.get("message", "MFapi returned an error."),
                    instrument=str(scheme_code),
                )

            meta = raw.get("meta") or {}
            rows = (raw.get("data") or [])[:days_clamped]
            history: List[Dict[str, Any]] = []
            latest_date: Optional[str] = None

            for entry in rows:
                nav_date = self._parse_nav_date(entry.get("date"))
                if nav_date is None:
                    continue
                try:
                    nav_val = float(entry.get("nav"))
                except (TypeError, ValueError):
                    continue
                if latest_date is None:
                    latest_date = nav_date
                history.append({"date": nav_date, "nav": nav_val})

            if not history or latest_date is None:
                return make_unavailable(
                    PROVIDER_ID,
                    f"No valid dated NAV history for scheme {scheme_code}.",
                    instrument=str(scheme_code),
                )

            return ProviderResponse(
                provider_id=PROVIDER_ID,
                source=PROVIDER_ID,
                data={
                    "scheme_code": scheme_code,
                    "scheme_name": meta.get("scheme_name"),
                    "fund_house": meta.get("fund_house"),
                    "scheme_category": meta.get("scheme_category"),
                    "latest_nav": history[0]["nav"],
                    "latest_nav_date": latest_date,
                    "history": history,
                    "label": "NAV",
                    "disclaimer": "Historical AMFI NAVs with explicit dates. Not real-time prices.",
                },
                instrument=str(scheme_code),
                currency="INR",
                unit="NAV per unit (INR)",
                observation_time=latest_date,
                freshness="NAV",
                status="ok",
                source_url=url,
            )

        return self._cached_coalesced_fetch(cache_key, _fetch, skip_cache=skip_cache)

    def fetch(self, **kwargs) -> ProviderResponse:
        if kwargs.get("scheme_code"):
            return self.get_latest_nav(int(kwargs["scheme_code"]))
        return self.search_schemes(kwargs.get("query", ""))


mfapi = MFAPIAdapter()
