"""Availability calculation: compute open time slots for a shop on a given date.

The binding scheduling unit is the **Resource** (a bay / chair / room / table /
slot — see ``shops.Resource``), NOT staff. For each candidate slot we check:
- shop is open (weekday hours, with date overrides)
- a specific Resource has no overlapping reservation
- no overlapping time block on that Resource (or shop-wide)

Staff is recorded on a reservation only as a non-binding request and is never
consulted here. Capacity at any instant equals the number of free Resources.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from django.db.models import Q
from django.utils import timezone

from apps.shops.models import HoursOverride, Resource, Staff, TimeBlock, WeekdayHours

from .models import Reservation


SLOT_GRANULARITY_MINUTES = 15

BLOCKING_STATUSES = [
    Reservation.Status.PENDING,
    Reservation.Status.CONFIRMED,
    Reservation.Status.COMPLETED,
]


def effective_duration_minutes(service, quantity: int) -> int:
    """The single source of truth for a multi-unit booking's visible duration.

    For N units the appointment occupies N service durations plus an
    inter-unit gap between consecutive units (N-1 gaps; never after the last
    unit, never for a single unit). At N=1 this is exactly
    ``service.duration_minutes`` (the gap term is 0), so existing services and
    every single-unit booking are byte-for-byte unchanged.

    The end-of-job ``service.buffer_minutes`` is NOT part of this value: it is
    applied once to the conflict/block window only, never to ``end_at``.
    """
    n = max(int(quantity), 1)
    return service.duration_minutes * n + service.inter_unit_buffer_minutes * (n - 1)


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


def _has_conflict(
    shop,
    resource,
    start_at: datetime,
    end_at: datetime,
    *,
    exclude_reservation_id: int | None = None,
) -> bool:
    """Whether `resource` is already taken for [start_at, end_at).

    Resource-only on purpose: two reservations conflict iff they share the
    same Resource and overlap in time. Staff is never considered. A time block
    blocks this Resource if it targets the Resource explicitly, or if it is
    shop-wide (neither resource nor staff set). Staff-only blocks are
    informational and never remove capacity.
    """
    qs = Reservation.objects.filter(
        shop=shop,
        resource=resource,
        status__in=BLOCKING_STATUSES,
        start_at__lt=end_at,
        end_at__gt=start_at,
    )
    if exclude_reservation_id is not None:
        qs = qs.exclude(pk=exclude_reservation_id)
    if qs.exists():
        return True

    blocks = TimeBlock.objects.filter(
        shop=shop,
        start_at__lt=end_at,
        end_at__gt=start_at,
    ).filter(
        Q(resource=resource) | Q(resource__isnull=True, staff__isnull=True)
    )
    return blocks.exists()


def active_resources(shop) -> list[Resource]:
    return list(Resource.objects.filter(shop=shop, is_active=True).order_by("id"))


def compute_slots(
    shop, service, resource: Resource, target_date: date, quantity: int = 1
) -> list[Slot]:
    """Open slots for a single Resource on a date.

    A Resource has no calendar of its own; it inherits the shop's open window.
    """
    window = _shop_open_window(shop, target_date)
    if window is None:
        return []

    tz = timezone.get_current_timezone()
    start_dt = datetime.combine(target_date, window[0], tzinfo=tz)
    end_dt = datetime.combine(target_date, window[1], tzinfo=tz)

    # Sequential quantity: duration scales linearly with per-unit gaps,
    # end-of-job buffer added once (to the block window, not the slot end).
    duration = timedelta(minutes=effective_duration_minutes(service, quantity))
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
        if not _has_conflict(shop, resource, cursor, slot_end):
            slots.append(Slot(start_at=cursor, end_at=cursor + duration))
        cursor += step

    return slots


def compute_slots_any(
    shop, service, target_date: date, quantity: int = 1
) -> list[Slot]:
    """Union of availability across every active Resource.

    A time is offered if at least one Resource is free for the full duration +
    buffer. A shop with no active Resources has zero capacity and offers
    nothing (every shop is given a default Resource on creation).
    """
    seen: dict[datetime, Slot] = {}
    for resource in active_resources(shop):
        for slot in compute_slots(shop, service, resource, target_date, quantity):
            seen.setdefault(slot.start_at, slot)
    return [seen[key] for key in sorted(seen)]


def assign_available_resource(
    shop,
    service,
    start_at: datetime,
    quantity: int = 1,
    *,
    exclude_reservation_id: int | None = None,
    resources: list[Resource] | None = None,
) -> Resource | None:
    """Return the lowest-id active Resource free at `start_at`, else None.

    Deterministic (orders by id) so behaviour is reproducible. `resources` lets
    the caller pass a pre-fetched / row-locked queryset for the atomic booking
    path (see services._allocate_resource); otherwise it reads them fresh.
    """
    end_at = start_at + timedelta(minutes=effective_duration_minutes(service, quantity))
    block_end = end_at + timedelta(minutes=service.buffer_minutes)
    candidates = active_resources(shop) if resources is None else resources
    for resource in candidates:
        if not _has_conflict(
            shop,
            resource,
            start_at,
            block_end,
            exclude_reservation_id=exclude_reservation_id,
        ):
            return resource
    return None


def eligible_staff(shop, service) -> list[Staff]:
    """Active staff who may perform this service — used to populate the
    optional "request a staff member" picker. Non-binding: this never affects
    availability or capacity (that's the Resource's job).

    If the service has explicit `eligible_staff` configured, restrict to that
    set; otherwise any active staff at the shop is eligible.
    """
    qs = Staff.objects.filter(shop=shop, is_active=True)
    configured_ids = list(service.eligible_staff.values_list("id", flat=True))
    if configured_ids:
        qs = qs.filter(id__in=configured_ids)
    return list(qs.order_by("id"))
