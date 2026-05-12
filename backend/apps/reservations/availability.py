"""Availability calculation: compute open time slots for a shop on a given date.

For each candidate slot we check:
- shop is open (weekday hours, with date overrides)
- staff is working (if staff is specified)
- no overlap with existing reservations (excluding cancellations)
- no overlap with manual time blocks
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Iterable

from django.utils import timezone

from apps.shops.models import HoursOverride, Staff, TimeBlock, WeekdayHours

from .models import Reservation


SLOT_GRANULARITY_MINUTES = 15


@dataclass
class Slot:
    start_at: datetime
    end_at: datetime


def _shop_open_window(shop, target_date: date) -> tuple[time, time] | None:
    override = HoursOverride.objects.filter(shop=shop, date=target_date).first()
    if override:
        if override.is_closed or not override.open_time or not override.close_time:
            return None
        return override.open_time, override.close_time

    weekday = target_date.weekday()
    hours = WeekdayHours.objects.filter(shop=shop, weekday=weekday).first()
    if not hours or hours.is_closed or not hours.open_time or not hours.close_time:
        return None
    return hours.open_time, hours.close_time


def _staff_window(staff: Staff, target_date: date) -> tuple[time, time] | None:
    weekday = target_date.weekday()
    sw = staff.working_hours.filter(weekday=weekday).first()
    if not sw or sw.is_off or not sw.start_time or not sw.end_time:
        return None
    return sw.start_time, sw.end_time


def _intersect(a: tuple[time, time], b: tuple[time, time] | None) -> tuple[time, time] | None:
    if b is None:
        return a
    start = max(a[0], b[0])
    end = min(a[1], b[1])
    if start >= end:
        return None
    return start, end


def _has_conflict(shop, staff, start_at: datetime, end_at: datetime) -> bool:
    from django.db.models import Q

    blocking_statuses = [
        Reservation.Status.PENDING,
        Reservation.Status.CONFIRMED,
        Reservation.Status.COMPLETED,
    ]
    qs = Reservation.objects.filter(
        shop=shop,
        status__in=blocking_statuses,
        start_at__lt=end_at,
        end_at__gt=start_at,
    )
    if staff is not None:
        qs = qs.filter(staff=staff)
    if qs.exists():
        return True

    blocks = TimeBlock.objects.filter(
        shop=shop,
        start_at__lt=end_at,
        end_at__gt=start_at,
    )
    if staff is not None:
        blocks = blocks.filter(Q(staff__isnull=True) | Q(staff=staff))
    else:
        blocks = blocks.filter(staff__isnull=True)
    return blocks.exists()


def compute_slots(shop, service, staff: Staff | None, target_date: date) -> list[Slot]:
    window = _shop_open_window(shop, target_date)
    if window is None:
        return []
    if staff is not None:
        window = _intersect(window, _staff_window(staff, target_date))
        if window is None:
            return []

    tz = timezone.get_current_timezone()
    start_dt = datetime.combine(target_date, window[0], tzinfo=tz)
    end_dt = datetime.combine(target_date, window[1], tzinfo=tz)

    duration = timedelta(minutes=service.duration_minutes)
    buffer_ = timedelta(minutes=service.buffer_minutes)
    step = timedelta(minutes=SLOT_GRANULARITY_MINUTES)

    now = timezone.now()
    slots: list[Slot] = []
    cursor = start_dt
    while cursor + duration <= end_dt:
        if cursor < now:
            cursor += step
            continue
        slot_end = cursor + duration + buffer_
        if not _has_conflict(shop, staff, cursor, slot_end):
            slots.append(Slot(start_at=cursor, end_at=cursor + duration))
        cursor += step

    return slots
