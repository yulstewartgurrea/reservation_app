"""Business logic for the shops app.

Per the CLAUDE.md service-layer convention, anything beyond a thin
serializer/permission wrapper belongs here so views stay focused on HTTP
plumbing.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Optional

from django.db.models import Q
from django.utils import timezone


def _is_time_within(now_time: time, open_t: time, close_t: time) -> bool:
    """True if `now_time` falls within the half-open interval [open, close).

    Both same-day intervals (open < close) and intervals that wrap past
    midnight (open > close, e.g. 22:00 -> 02:00 next day) are supported.
    Closed-on-the-dot (now_time == close_t) returns False so that a shop
    listed as "open 9-17" stops appearing as open at exactly 17:00.
    """
    if open_t == close_t:
        # A zero-length window is treated as closed.
        return False
    if open_t < close_t:
        return open_t <= now_time < close_t
    # Wrap-around (e.g. 22:00 -> 02:00).
    return now_time >= open_t or now_time < close_t


def is_shop_open_now(shop, *, now: Optional[datetime] = None) -> bool:
    """True if `shop` is currently open in the project timezone.

    Resolution order:
      1. If a `HoursOverride` exists for today and `is_closed=True`, the
         shop is closed.
      2. If a `HoursOverride` exists for today with open/close times set,
         those times win over the weekday schedule.
      3. Otherwise the matching `WeekdayHours` row decides (closed flag or
         falling outside the open/close window -> closed).

    Assumes `shop.weekday_hours` and today's `shop.overrides` have been
    prefetched/annotated by the caller (the list endpoint does this) so we
    iterate the cached lists rather than re-query.
    """
    local_now = timezone.localtime(now) if now is not None else timezone.localtime()
    today = local_now.date()
    now_t = local_now.time()
    weekday = today.weekday()  # Monday=0..Sunday=6, matches WeekdayHours.Weekday

    # 1 & 2 — today's override, if any. Prefer the list endpoint's
    # narrow prefetch (only today's row); otherwise walk all overrides.
    overrides_today = getattr(shop, "_prefetched_overrides_today", None)
    if overrides_today is None:
        overrides_today = [ov for ov in shop.overrides.all() if ov.date == today]
    override = None
    for ov in overrides_today:
        if ov.date == today:
            override = ov
            break
    if override is not None:
        if override.is_closed:
            return False
        if override.open_time and override.close_time:
            return _is_time_within(now_t, override.open_time, override.close_time)
        # Override exists but has no usable times (e.g. just a note) — fall
        # through to weekday hours.

    # 3 — weekday schedule.
    row = None
    for wh in shop.weekday_hours.all():
        if wh.weekday == weekday:
            row = wh
            break
    if row is None or row.is_closed or not row.open_time or not row.close_time:
        return False
    return _is_time_within(now_t, row.open_time, row.close_time)


BOOKING_TIME_WINDOW_MINUTES = 30


def shop_has_free_slot_on_date(
    shop,
    target_date: date,
    *,
    target_time: Optional[time] = None,
    quantity: int = 1,
) -> bool:
    """True if `shop` has at least one bookable slot on `target_date`.

    Backs the public browse page's `?booking_date=` / `?booking_time=` /
    `?guests=` filters: customers asking "where can I book on this day at this
    time for N people?" should not see fully-booked, closed, or capacity-short
    shops.

    Args:
        target_time: When provided, only slots whose start time falls within
            ``BOOKING_TIME_WINDOW_MINUTES`` of this time count. The window is
            forgiving on purpose — slot granularity is 15 min, so an exact
            match would force the customer to pick a precise quarter-hour.
        quantity: Party size / units (`Reservation.quantity`). Services whose
            ``max_quantity`` is below this value are skipped — they can't
            accept the booking even if they have a slot. Defaults to 1 so
            existing callers see the original behaviour.

    Implementation notes:
      * Imports `compute_slots` lazily to avoid pulling reservations app at
        import time and to keep the shops app's import graph dependency-free.
      * Short-circuits on the first matching slot found.
      * Skips shops with no active services or resources (zero capacity).
      * Treats past dates as unavailable so historical days never match.
    """
    from apps.reservations.availability import _shop_open_window, compute_slots

    today = timezone.localdate()
    if target_date < today:
        return False
    if _shop_open_window(shop, target_date) is None:
        return False

    qty = max(int(quantity), 1)
    services = list(
        shop.services.filter(is_active=True, max_quantity__gte=qty).only("id")
    )
    if not services:
        return False
    resources = list(shop.resources.filter(is_active=True).only("id"))
    if not resources:
        return False

    full_services = (
        shop.services.filter(is_active=True, max_quantity__gte=qty).order_by("id")
    )
    window = (
        timedelta(minutes=BOOKING_TIME_WINDOW_MINUTES) if target_time else None
    )
    for service in full_services:
        for resource in resources:
            slots = compute_slots(shop, service, resource, target_date, qty)
            if not slots:
                continue
            if target_time is None:
                return True
            tz = timezone.get_current_timezone()
            target_dt = datetime.combine(target_date, target_time, tzinfo=tz)
            for slot in slots:
                if abs(slot.start_at - target_dt) <= window:
                    return True
    return False


def service_has_free_slot_on_date(
    service,
    target_date: date,
    *,
    quantity: int = 1,
) -> bool:
    """True if `service` itself has at least one bookable slot on `target_date`.

    Per-service analogue of [[shop_has_free_slot_on_date]]: backs the public
    services-browse `?booking_date=` / `?guests=` filters where customers ask
    "which services can I book on this day for N people?". A service fails the
    check when its own `max_quantity` is too low, its shop is closed, or none
    of the shop's active resources yields a valid slot for it on that date.
    """
    from apps.reservations.availability import _shop_open_window, compute_slots

    today = timezone.localdate()
    if target_date < today:
        return False

    qty = max(int(quantity), 1)
    if service.max_quantity < qty:
        return False

    shop = service.shop
    if _shop_open_window(shop, target_date) is None:
        return False

    resources = list(shop.resources.filter(is_active=True).only("id"))
    if not resources:
        return False

    for resource in resources:
        if compute_slots(shop, service, resource, target_date, qty):
            return True
    return False


# ---------------------------------------------------------------------------
# Per-day station availability dashboard
# ---------------------------------------------------------------------------
#
# Backs the shop-owner Stations page (real-time availability + timeline). The
# response shape is documented in apps/shops/views.py::ShopViewSet.stations_availability
# and exercised by apps/shops/tests/test_stations_availability.py.

_MAX_LABEL_LEN = 32


def _short_customer_name(reservation) -> str:
    """`<First L.>` from the customer profile, else the guest_name verbatim.

    Returns "" when there is neither a customer nor a guest_name so the caller
    can fall back to the service name alone.
    """
    customer = reservation.customer
    if customer is not None:
        first = (customer.first_name or "").strip()
        last = (customer.last_name or "").strip()
        if first and last:
            return f"{first} {last[0]}."
        if first:
            return first
        # No name on file — fall back to the local part of the email so the
        # owner still gets something identifying instead of "—".
        email = (customer.email or "").strip()
        if email:
            return email.split("@", 1)[0]
    return (reservation.guest_name or "").strip()


def _reservation_label(reservation) -> str:
    """`"<customer first + last initial> — <service name>"`, truncated.

    Kept under `_MAX_LABEL_LEN` chars so the timeline pill on the frontend
    doesn't blow out a station row. Truncates the service name first
    (preserving the customer name), then falls back to plain truncation if
    even the customer name is too long.
    """
    name = _short_customer_name(reservation)
    service_name = reservation.service.name if reservation.service_id else ""
    if name and service_name:
        full = f"{name} — {service_name}"
    else:
        full = name or service_name or "Reserved"
    if len(full) <= _MAX_LABEL_LEN:
        return full
    # Try trimming the service name with an ellipsis before giving up on the
    # whole label.
    if name and service_name:
        room_for_service = _MAX_LABEL_LEN - len(name) - len(" — ") - 1
        if room_for_service >= 4:
            return f"{name} — {service_name[: room_for_service - 1]}…"
    return full[: _MAX_LABEL_LEN - 1] + "…"


def _format_hm(dt_or_time) -> Optional[str]:
    """HH:MM string for either a `time` or a `datetime` (rendered local)."""
    if dt_or_time is None:
        return None
    if isinstance(dt_or_time, datetime):
        return timezone.localtime(dt_or_time).strftime("%H:%M")
    return dt_or_time.strftime("%H:%M")


def _clip_interval(start_dt: datetime, end_dt: datetime, window_start: datetime, window_end: datetime):
    """Intersect `[start_dt, end_dt)` with `[window_start, window_end)`.

    Returns `(clipped_start, clipped_end)` or `None` if disjoint or zero-length.
    Used to keep reservations / blocks that straddle the open window
    contained inside it so the rendered timeline matches the day's hours.
    """
    s = max(start_dt, window_start)
    e = min(end_dt, window_end)
    if s >= e:
        return None
    return s, e


def _merge_busy_intervals(intervals: list[tuple[datetime, datetime, str, str]]):
    """Order + de-overlap busy intervals for a single station.

    Input tuples: `(start, end, kind, label)` where `kind` is `"reserved"` or
    `"blocked"`. Reservations win over blocks when they overlap — implemented
    by sorting reservations first within the same start time and then dropping
    any block segment that is entirely covered by an adjacent reservation.

    We don't aim for perfect interval algebra; in practice reservations and
    blocks rarely overlap, and when they do the "reservation wins" rule is
    enforced by trimming the block to the gaps the reservation leaves behind.
    """
    if not intervals:
        return []
    # Sort: reservations before blocks at the same start, then by start time.
    kind_priority = {"reserved": 0, "blocked": 1}
    intervals = sorted(
        intervals,
        key=lambda x: (x[0], kind_priority.get(x[2], 9), x[1]),
    )

    # Carve out reserved spans first; subtract them from each block.
    reserved = [(s, e, k, lab) for (s, e, k, lab) in intervals if k == "reserved"]
    blocks = [(s, e, k, lab) for (s, e, k, lab) in intervals if k == "blocked"]

    trimmed_blocks: list[tuple[datetime, datetime, str, str]] = []
    for bs, be, bk, blab in blocks:
        pieces = [(bs, be)]
        for rs, re_, _, _ in reserved:
            new_pieces = []
            for ps, pe in pieces:
                if re_ <= ps or rs >= pe:
                    new_pieces.append((ps, pe))
                    continue
                if rs > ps:
                    new_pieces.append((ps, rs))
                if re_ < pe:
                    new_pieces.append((re_, pe))
            pieces = new_pieces
        for ps, pe in pieces:
            if ps < pe:
                trimmed_blocks.append((ps, pe, bk, blab))

    merged = sorted(reserved + trimmed_blocks, key=lambda x: x[0])

    # Collapse identical-kind adjacency (a block split by a reservation might
    # leave back-to-back blocks; nothing fancy needed beyond that).
    collapsed: list[tuple[datetime, datetime, str, str]] = []
    for item in merged:
        if collapsed and collapsed[-1][2] == item[2] and collapsed[-1][1] == item[0] and collapsed[-1][3] == item[3]:
            collapsed[-1] = (collapsed[-1][0], item[1], item[2], item[3])
        else:
            collapsed.append(item)
    return collapsed


def _build_segments(
    open_dt: datetime,
    close_dt: datetime,
    busy: list[tuple[datetime, datetime, str, str]],
) -> list[dict]:
    """Tile `[open_dt, close_dt)` with available + busy segments.

    `busy` is the merged list from `_merge_busy_intervals` (sorted, non-overlapping).
    Available gaps are filled in between. Output items use HH:MM strings.
    """
    segments: list[dict] = []
    cursor = open_dt
    for start, end, kind, label in busy:
        if start > cursor:
            segments.append(
                {"start": _format_hm(cursor), "end": _format_hm(start), "kind": "available"}
            )
        segments.append(
            {
                "start": _format_hm(start),
                "end": _format_hm(end),
                "kind": kind,
                "label": label,
            }
        )
        cursor = end
    if cursor < close_dt:
        segments.append(
            {"start": _format_hm(cursor), "end": _format_hm(close_dt), "kind": "available"}
        )
    return segments


def _current_status_for_active(
    *,
    is_today: bool,
    now_dt: datetime,
    open_dt: datetime,
    close_dt: datetime,
    busy: list[tuple[datetime, datetime, str, str]],
) -> tuple[str, Optional[str], Optional[str]]:
    """Return `(current_status, busy_until, next_available_at)` for an active station.

    `busy_until` and `next_available_at` are HH:MM strings (or None). The
    semantics are documented inline in `station_day_availability`.
    """
    if not is_today:
        # On future dates "now" doesn't apply — the station is broadly
        # available; the timeline tells the rest of the story.
        next_avail = _format_hm(open_dt) if _has_any_available_gap(open_dt, close_dt, busy) else None
        return "available", None, next_avail

    if now_dt < open_dt:
        return "closed", None, _format_hm(open_dt)
    if now_dt >= close_dt:
        return "closed", None, None

    # We're inside the open window. Find the busy interval containing `now`.
    containing = next(((s, e, k, _) for (s, e, k, _) in busy if s <= now_dt < e), None)
    if containing is not None:
        _, end, kind, _label = containing
        current = "busy" if kind == "reserved" else "blocked"
        next_avail = _next_available_after(now_dt, open_dt, close_dt, busy)
        return current, _format_hm(end), next_avail

    # `now` falls in an available gap.
    return "available", None, _next_available_after(now_dt, open_dt, close_dt, busy)


def _has_any_available_gap(
    open_dt: datetime,
    close_dt: datetime,
    busy: list[tuple[datetime, datetime, str, str]],
) -> bool:
    cursor = open_dt
    for s, e, _k, _l in busy:
        if s > cursor:
            return True
        cursor = max(cursor, e)
    return cursor < close_dt


def _next_available_after(
    now_dt: datetime,
    open_dt: datetime,
    close_dt: datetime,
    busy: list[tuple[datetime, datetime, str, str]],
) -> Optional[str]:
    """First available segment that *starts* strictly after `now_dt`.

    Used for the "next available" hint on a station that is currently busy or
    currently available (the latter shows the next time after the upcoming
    busy span ends). Returns None if there's no future available gap today.
    """
    # Walk busy intervals; the gaps between them are available.
    cursor = open_dt
    for s, e, _k, _l in busy:
        if s > cursor:
            gap_start = cursor
            gap_end = s
            if gap_start > now_dt:
                return _format_hm(gap_start)
            # The gap straddles `now` — the *next* available is after the
            # next busy chunk.
        cursor = max(cursor, e)
    if cursor < close_dt and cursor > now_dt:
        return _format_hm(cursor)
    return None


def station_day_availability(shop, target_date: date) -> dict:
    """Per-station availability + timeline for a single day.

    Powers the shop-owner Stations page. The shape is stable and documented
    in the route handler; see the test suite for examples.

    Performance contract:
      * 1 query for resources
      * 1 query for reservations on the date
      * 1 query for time blocks on the date
      * 1 query for the date's HoursOverride (via `_shop_open_window`)
      * 1 query for the matching WeekdayHours row
      => O(stations) Python work, no N+1.
    """
    # Import lazily — `apps.reservations.availability` reaches back into
    # `apps.shops` and the BLOCKING_STATUSES constant is the only thing we
    # need here.
    from apps.reservations.availability import BLOCKING_STATUSES, _shop_open_window
    from apps.reservations.models import Reservation

    from .models import Resource, TimeBlock

    tz = timezone.get_current_timezone()
    now_dt = timezone.localtime()
    today = now_dt.date()
    is_today = target_date == today

    resource_qs = Resource.objects.filter(shop=shop).order_by("id")
    resources = list(resource_qs)

    paused = shop.status == shop.Status.PAUSED
    window = None if paused else _shop_open_window(shop, target_date)
    is_closed = window is None

    if is_closed:
        stations_out = []
        for res in resources:
            if not res.is_active:
                stations_out.append(_inactive_station_dict(res))
                continue
            stations_out.append(
                {
                    "id": res.id,
                    "name": res.name,
                    "is_active": True,
                    "current_status": "closed",
                    "busy_until": None,
                    "next_available_at": None,
                    "segments": [],
                    "bookings": [],
                    "blocks": [],
                }
            )
        return {
            "date": target_date.isoformat(),
            "shop": {
                "resource_label": shop.resource_label,
                "is_closed": True,
                "open_time": None,
                "close_time": None,
            },
            "summary": {
                "total_stations": sum(1 for r in resources if r.is_active),
                "available_now": 0,
                "busy_now": 0,
                "upcoming_today": 0,
            },
            "stations": stations_out,
        }

    open_time, close_time = window
    open_dt = timezone.make_aware(datetime.combine(target_date, open_time), tz)
    close_dt = timezone.make_aware(datetime.combine(target_date, close_time), tz)

    day_start = timezone.make_aware(datetime.combine(target_date, time.min), tz)
    day_end = day_start + timedelta(days=1)

    reservations = list(
        Reservation.objects.filter(
            shop=shop,
            status__in=BLOCKING_STATUSES,
            start_at__lt=day_end,
            end_at__gt=day_start,
        )
        .select_related("service", "customer", "resource")
        .order_by("start_at")
    )

    time_blocks = list(
        TimeBlock.objects.filter(
            shop=shop,
            start_at__lt=day_end,
            end_at__gt=day_start,
        )
        .order_by("start_at")
    )

    # Bucket reservations and shop-wide / resource-specific blocks per Resource.
    res_by_resource: dict[int, list] = {r.id: [] for r in resources}
    for r in reservations:
        if r.resource_id and r.resource_id in res_by_resource:
            res_by_resource[r.resource_id].append(r)

    # Shop-wide blocks apply to every active resource.
    shop_wide_blocks = [tb for tb in time_blocks if tb.resource_id is None and tb.staff_id is None]
    blocks_by_resource: dict[int, list] = {r.id: list(shop_wide_blocks) for r in resources}
    for tb in time_blocks:
        if tb.resource_id and tb.resource_id in blocks_by_resource:
            blocks_by_resource[tb.resource_id].append(tb)
        # Staff-only blocks (resource_id is None and staff_id is set) are
        # informational and never remove availability — drop them here.

    stations_out: list[dict] = []
    available_now = 0
    busy_now = 0
    upcoming_today = 0

    for res in resources:
        if not res.is_active:
            stations_out.append(_inactive_station_dict(res))
            continue

        # Build busy intervals (clipped to the open window) for this resource.
        busy: list[tuple[datetime, datetime, str, str]] = []
        bookings_payload: list[dict] = []
        blocks_payload: list[dict] = []

        for r in res_by_resource.get(res.id, []):
            clipped = _clip_interval(r.start_at, r.end_at, open_dt, close_dt)
            label = _reservation_label(r)
            if clipped is not None:
                busy.append((clipped[0], clipped[1], "reserved", label))
            bookings_payload.append(
                {
                    "id": r.id,
                    "start_at": r.start_at.isoformat(),
                    "end_at": r.end_at.isoformat(),
                    "status": r.status,
                    "service_name": r.service.name if r.service_id else "",
                    "customer_name": _short_customer_name(r) or "",
                }
            )
            # Count upcoming reservations against the day-level total once
            # (we'll dedupe inside the loop). A reservation is "upcoming" if
            # it ends after `now` on today; on a future date everything
            # counts.
            if is_today:
                if r.end_at > now_dt:
                    upcoming_today += 1
            else:
                upcoming_today += 1

        for tb in blocks_by_resource.get(res.id, []):
            clipped = _clip_interval(tb.start_at, tb.end_at, open_dt, close_dt)
            label = tb.reason or "Blocked"
            if clipped is not None:
                busy.append((clipped[0], clipped[1], "blocked", label))
            blocks_payload.append(
                {
                    "id": tb.id,
                    "start_at": tb.start_at.isoformat(),
                    "end_at": tb.end_at.isoformat(),
                    "reason": tb.reason,
                }
            )

        merged = _merge_busy_intervals(busy)
        segments = _build_segments(open_dt, close_dt, merged)

        current, busy_until, next_available_at = _current_status_for_active(
            is_today=is_today,
            now_dt=now_dt,
            open_dt=open_dt,
            close_dt=close_dt,
            busy=merged,
        )

        if current == "available":
            available_now += 1
        elif current in ("busy", "blocked"):
            busy_now += 1

        stations_out.append(
            {
                "id": res.id,
                "name": res.name,
                "is_active": True,
                "current_status": current,
                "busy_until": busy_until,
                "next_available_at": next_available_at,
                "segments": segments,
                "bookings": bookings_payload,
                "blocks": blocks_payload,
            }
        )

    return {
        "date": target_date.isoformat(),
        "shop": {
            "resource_label": shop.resource_label,
            "is_closed": False,
            "open_time": _format_hm(open_time),
            "close_time": _format_hm(close_time),
        },
        "summary": {
            "total_stations": sum(1 for r in resources if r.is_active),
            "available_now": available_now,
            "busy_now": busy_now,
            "upcoming_today": upcoming_today,
        },
        "stations": stations_out,
    }


def _inactive_station_dict(resource) -> dict:
    """Payload for a retired (`is_active=False`) station.

    Still returned in the response so the frontend can render a greyed-out
    row, but contributes nothing to the day's segments / counters.
    """
    return {
        "id": resource.id,
        "name": resource.name,
        "is_active": False,
        "current_status": "offline",
        "busy_until": None,
        "next_available_at": None,
        "segments": [],
        "bookings": [],
        "blocks": [],
    }
