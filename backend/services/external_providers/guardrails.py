"""
Workflow Protection Guardrails for Supplemental External APIs.

Enforces Section 4 rules:
- Research/reference/EOD providers must NEVER be promoted to LIVE quotes or trigger execution.
- Missing or stale timestamps must fail closed rather than substitute current retrieval time.
- Currency, unit, exchange, adjustment basis, and entitlement must match before fallback.
- General public-holiday APIs must never serve as an NSE trading calendar.
"""

from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

RESEARCH_FRESHNESS_LABELS = frozenset({
    "REFERENCE_RATE",
    "END_OF_DAY",
    "NAV",
    "DELAYED",
    "UNAVAILABLE",
})


def enforce_non_live_freshness(freshness: Optional[str], source: str) -> str:
    """
    Ensure delayed, EOD, reference, or NAV data can never retain or be promoted to a LIVE label.
    """
    if not freshness or freshness.upper() == "LIVE":
        # Non-exchange research feeds are never permitted to display LIVE
        return "DELAYED" if source else "UNAVAILABLE"
    norm = freshness.upper()
    if norm in RESEARCH_FRESHNESS_LABELS:
        return norm
    return "UNAVAILABLE"


def validate_currency_and_unit(
    expected_currency: Optional[str],
    actual_currency: Optional[str],
    expected_unit: Optional[str] = None,
    actual_unit: Optional[str] = None,
) -> Tuple[bool, Optional[str]]:
    """Reject incompatible currency or unit pairs before quantitative comparison."""
    if expected_currency and actual_currency:
        if expected_currency.strip().upper() != actual_currency.strip().upper():
            return False, (
                f"Currency mismatch: expected {expected_currency.upper()}, "
                f"got {actual_currency.upper()}"
            )
    if expected_currency and not actual_currency:
        return False, f"Missing currency metadata (expected {expected_currency.upper()})"

    if expected_unit and actual_unit:
        if expected_unit.strip().lower() != actual_unit.strip().lower():
            return False, f"Unit mismatch: expected '{expected_unit}', got '{actual_unit}'"

    return True, None


def validate_observation_timestamp(
    observation_time: Optional[str],
    max_age_seconds: Optional[int] = None,
    reference_time: Optional[datetime] = None,
) -> Tuple[bool, Optional[str]]:
    """
    Reject missing/unparseable or overly old timestamps instead of falling back to now().
    """
    if not observation_time:
        return False, "Missing observation timestamp"

    try:
        raw = observation_time.strip()
        # Handle YYYY year-only macro observations or YYYY-MM-DD dates explicitly
        if len(raw) == 4 and raw.isdigit():
            parsed = datetime(int(raw), 12, 31, tzinfo=timezone.utc)
        elif len(raw) == 10 and raw[4] == "-" and raw[7] == "-":
            parsed = datetime.fromisoformat(raw).replace(tzinfo=timezone.utc)
        else:
            parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return False, f"Invalid observation timestamp format: {observation_time}"

    if max_age_seconds is not None:
        ref = reference_time or datetime.now(timezone.utc)
        if ref.tzinfo is None:
            ref = ref.replace(tzinfo=timezone.utc)
        age = (ref - parsed.astimezone(timezone.utc)).total_seconds()
        if age > max_age_seconds:
            return False, f"Observation timestamp is stale ({int(age)}s old > max {max_age_seconds}s)"

    return True, None


def can_fallback_market_series(primary: Dict[str, Any], candidate: Dict[str, Any]) -> Tuple[bool, str]:
    """
    Verify fallback compatibility across instrument, exchange, currency, data_type,
    adjustment_basis, entitlement, and freshness before mixing or substituting data.
    """
    checks = [
        ("instrument", "instrument mismatch"),
        ("exchange", "exchange mismatch"),
        ("currency", "currency mismatch"),
        ("data_type", "data type mismatch"),
        ("adjustment_basis", "corporate-action adjustment basis mismatch"),
        ("entitlement", "entitlement level mismatch"),
    ]
    for field_name, msg in checks:
        p_val = primary.get(field_name)
        c_val = candidate.get(field_name)
        if p_val != c_val:
            return False, f"Fallback rejected: {msg} ({p_val!r} vs {c_val!r})"

    if primary.get("require_realtime") and candidate.get("freshness") != "LIVE":
        return False, "Fallback rejected: delayed/EOD candidate cannot satisfy real-time threshold"

    return True, "Compatible"
