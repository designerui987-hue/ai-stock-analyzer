"""
NSE Trading Calendar, Holiday Registry & Special Session Evaluator (Asia/Kolkata).

Source of truth for Indian equity session state (NSE Capital Market segment):
- Pre-Open: 09:00 - 09:15 IST
- Regular Continuous Trading: 09:15 - 15:30 IST (Monday-Friday, non-holiday)
- Post-Close: 15:30 - 16:00 IST
- Maintained NSE Equity Holiday table (2024-2027)
- Special trading sessions override (e.g. Muhurat Trading, Union Budget Saturday sessions)

Note: Exchange circulars may add unscheduled sessions or revise holidays intra-year;
verify against NSE circulars before live order operations.
"""

from datetime import date, datetime, time
from typing import Dict, Optional, Tuple
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")

# NSE Capital Market trading holidays (date ISO -> holiday label)
NSE_HOLIDAYS: Dict[str, str] = {
    # 2024
    "2024-01-22": "Special Holiday (Pran Pratishtha)",
    "2024-01-26": "Republic Day",
    "2024-03-08": "Maha Shivratri",
    "2024-03-25": "Holi",
    "2024-03-29": "Good Friday",
    "2024-04-11": "Id-Ul-Fitr (Ramzan Id)",
    "2024-04-17": "Shri Ram Navami",
    "2024-05-01": "Maharashtra Day",
    "2024-05-20": "Lok Sabha Election (Mumbai)",
    "2024-06-17": "Bakri Id",
    "2024-07-17": "Moharram",
    "2024-08-15": "Independence Day",
    "2024-10-02": "Mahatma Gandhi Jayanti",
    "2024-11-01": "Diwali Laxmi Pujan (Muhurat session only)",
    "2024-11-15": "Gurunanak Jayanti",
    "2024-11-20": "Maharashtra Assembly Election",
    "2024-12-25": "Christmas",
    # 2025
    "2025-02-26": "Maha Shivratri",
    "2025-03-14": "Holi",
    "2025-03-31": "Id-Ul-Fitr (Ramzan Id)",
    "2025-04-10": "Shri Mahavir Jayanti",
    "2025-04-14": "Dr. Baba Saheb Ambedkar Jayanti",
    "2025-04-18": "Good Friday",
    "2025-05-01": "Maharashtra Day",
    "2025-08-15": "Independence Day",
    "2025-08-27": "Ganesh Chaturthi",
    "2025-10-02": "Mahatma Gandhi Jayanti / Dussehra",
    "2025-10-21": "Diwali Laxmi Pujan (Muhurat session only)",
    "2025-10-22": "Diwali Balipratipada",
    "2025-11-05": "Prakash Gurpurb Sri Guru Nanak Dev",
    "2025-12-25": "Christmas",
    # 2026
    "2026-01-15": "Maharashtra Municipal Election Holiday",
    "2026-01-26": "Republic Day",
    "2026-03-03": "Holi",
    "2026-03-26": "Shri Ram Navami",
    "2026-03-31": "Shri Mahavir Jayanti",
    "2026-04-03": "Good Friday",
    "2026-04-14": "Dr. Baba Saheb Ambedkar Jayanti",
    "2026-05-01": "Maharashtra Day",
    "2026-05-28": "Bakri Id",
    "2026-06-26": "Muharram",
    "2026-09-14": "Ganesh Chaturthi",
    "2026-10-02": "Mahatma Gandhi Jayanti",
    "2026-10-20": "Dussehra",
    "2026-11-08": "Diwali Laxmi Pujan (Muhurat session only)",
    "2026-11-10": "Diwali Balipratipada",
    "2026-11-24": "Prakash Gurpurb Sri Guru Nanak Dev",
    "2026-12-25": "Christmas",
    # 2027 (provisional major fixed/exchange holidays)
    "2027-01-26": "Republic Day",
    "2027-03-26": "Good Friday",
    "2027-04-14": "Dr. Baba Saheb Ambedkar Jayanti",
    "2027-05-01": "Maharashtra Day",
    "2027-08-15": "Independence Day",
    "2027-10-02": "Mahatma Gandhi Jayanti",
    "2027-12-25": "Christmas",
}

# Special NSE sessions that run despite weekend or Diwali holiday
# date ISO -> (session_name, start_time_ist, end_time_ist)
NSE_SPECIAL_SESSIONS: Dict[str, Tuple[str, time, time]] = {
    "2024-11-01": ("Muhurat Trading 2024", time(18, 0), time(19, 0)),
    "2025-02-01": ("Union Budget Special Session 2025", time(9, 15), time(15, 30)),
    "2025-10-21": ("Muhurat Trading 2025", time(13, 45), time(14, 45)),
    "2026-02-01": ("Union Budget Special Session 2026", time(9, 15), time(15, 30)),
    "2026-11-08": ("Muhurat Trading 2026", time(18, 0), time(19, 0)),
}


def to_ist(dt: Optional[datetime] = None) -> datetime:
    """Convert any aware/naive datetime (assumed UTC if naive) to Asia/Kolkata."""
    if dt is None:
        return datetime.now(IST)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=ZoneInfo("UTC")).astimezone(IST)
    return dt.astimezone(IST)


def is_nse_holiday(d: date) -> Tuple[bool, Optional[str]]:
    """Return (is_holiday, holiday_name) for a calendar date in IST."""
    name = NSE_HOLIDAYS.get(d.isoformat())
    return (name is not None, name)


def get_special_session(dt: Optional[datetime] = None) -> Optional[Dict[str, str]]:
    """Return special session descriptor if `dt` falls on an NSE special session day."""
    ist_dt = to_ist(dt)
    spec = NSE_SPECIAL_SESSIONS.get(ist_dt.date().isoformat())
    if not spec:
        return None
    name, start_t, end_t = spec
    cur_t = ist_dt.time()
    active = start_t <= cur_t < end_t
    return {
        "name": name,
        "start_ist": start_t.strftime("%H:%M"),
        "end_ist": end_t.strftime("%H:%M"),
        "active": "true" if active else "false",
    }


def is_trading_day(d: Optional[date] = None) -> bool:
    """Return True if date is a normal NSE trading weekday OR has a scheduled special session."""
    target_date = d or to_ist().date()
    if target_date.isoformat() in NSE_SPECIAL_SESSIONS:
        return True
    if target_date.weekday() >= 5:
        return False
    is_hol, _ = is_nse_holiday(target_date)
    return not is_hol


def get_market_session(dt: Optional[datetime] = None) -> str:
    """
    Evaluate exact NSE market session for `dt` (Asia/Kolkata):
    PRE_OPEN | REGULAR | SPECIAL_SESSION | POST_CLOSE | HOLIDAY | WEEKEND | CLOSED
    """
    ist_dt = to_ist(dt)
    day_iso = ist_dt.date().isoformat()
    cur_t = ist_dt.time()

    # Special session check takes precedence over holiday/weekend
    spec = NSE_SPECIAL_SESSIONS.get(day_iso)
    if spec:
        _, start_t, end_t = spec
        if start_t <= cur_t < end_t:
            return "SPECIAL_SESSION"
        return "CLOSED"

    if ist_dt.weekday() >= 5:
        return "WEEKEND"

    is_hol, _ = is_nse_holiday(ist_dt.date())
    if is_hol:
        return "HOLIDAY"

    if time(9, 0) <= cur_t < time(9, 15):
        return "PRE_OPEN"
    if time(9, 15) <= cur_t < time(15, 30):
        return "REGULAR"
    if time(15, 30) <= cur_t < time(16, 0):
        return "POST_CLOSE"
    return "CLOSED"


def is_regular_or_special_open(dt: Optional[datetime] = None) -> bool:
    """Return True only when continuous regular or special trading is active."""
    return get_market_session(dt) in ("REGULAR", "SPECIAL_SESSION")

