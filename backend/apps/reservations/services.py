"""Business logic for creating and transitioning reservations."""

from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .availability import (
    assign_available_resource,
    effective_duration_minutes,
)
from .models import CommissionLedger, Reservation, ReservationStatusHistory


def _commission_rate_for(shop) -> Decimal:
    if shop.commission_rate is not None:
        return shop.commission_rate
    return Decimal(str(settings.DEFAULT_COMMISSION_RATE))


def _allocate_resource(shop, service, start_at, quantity, *, exclude_reservation_id=None):
    """Row-lock this shop's Resources and return the first one free for the slot.

    `select_for_update` over ALL of the shop's active Resources serialises
    concurrent bookers for the same shop: a second booker blocks until the
    first commits, then re-evaluates against the now-committed reservation — so
    two bookings can never be handed the same Resource under load. Returns None
    if every Resource is busy; the caller turns that into a slot-conflict error.
    Must be called inside a transaction (all callers are @transaction.atomic).
    """
    from apps.shops.models import Resource

    locked = list(
        Resource.objects.select_for_update()
        .filter(shop=shop, is_active=True)
        .order_by("id")
    )
    return assign_available_resource(
        shop,
        service,
        start_at,
        quantity,
        exclude_reservation_id=exclude_reservation_id,
        resources=locked,
    )


def _ensure_not_in_past(start_at):
    """Block bookings whose start time has already passed.

    The frontend `min` attribute on the date picker is the friendly UX guard;
    this is the server-side belt-and-suspenders so a determined client can't
    POST a past datetime directly.
    """
    if start_at < timezone.now():
        raise ValidationError("Cannot book a time in the past.")


def _validate_quantity(service, quantity) -> int:
    """Normalize and bound-check a requested unit count for a service.

    Defaults to 1 (backward compatible). Rejects < 1 or anything above the
    service's per-service opt-in cap (`max_quantity`, default 1 = not offered).
    """
    if quantity is None:
        return 1
    quantity = int(quantity)
    if quantity < 1:
        raise ValidationError("Quantity must be at least 1.")
    if quantity > service.max_quantity:
        raise ValidationError(
            f"Quantity exceeds the maximum of {service.max_quantity} for this service."
        )
    return quantity


def _total_from_unit_price(unit_price: Decimal, quantity: int) -> Decimal:
    """The single source of truth for the price invariant.

    total_price is always derived from the *stored* per-unit price, never
    re-read live from Service.price. This keeps an already-booked reservation
    frozen at the price the customer agreed to, so commission and revenue
    (which read this snapshot) stay historically correct after a price change.
    """
    return (Decimal(unit_price) * quantity).quantize(Decimal("0.01"))


def _restrictions_for_customer(customer) -> str | None:
    if customer is None:
        return None
    if customer.restricted_until and customer.restricted_until > timezone.now():
        return "Account is currently restricted from booking."
    return None


@transaction.atomic
def create_customer_reservation(
    *,
    customer,
    shop,
    service,
    start_at,
    staff=None,
    customer_notes="",
    payment_method=Reservation.PaymentMethod.PAY_ON_ARRIVAL,
    quantity=1,
):
    if (msg := _restrictions_for_customer(customer)):
        raise ValidationError(msg)

    # Canonical billing block: a shop with an overdue unpaid commission
    # invoice cannot take NEW online bookings until it settles.
    from .commission_billing import assert_shop_not_blocked_for_commission

    assert_shop_not_blocked_for_commission(shop)

    quantity = _validate_quantity(service, quantity)
    _ensure_not_in_past(start_at)
    # Sequential model: quantity scales duration & price linearly, one Resource,
    # one contiguous block; per-unit gaps live in the visible duration, the
    # end-of-job buffer is added ONCE to the block window only (not end_at).
    end_at = start_at + timedelta(
        minutes=effective_duration_minutes(service, quantity)
    )

    # Reserve a Resource (the binding unit). `staff`, if given, is recorded as a
    # non-binding request and never conflict-checked.
    resource = _allocate_resource(shop, service, start_at, quantity)
    if resource is None:
        raise ValidationError("Selected time slot is no longer available.")

    reservation = Reservation.objects.create(
        customer=customer,
        shop=shop,
        service=service,
        resource=resource,
        staff=staff,
        start_at=start_at,
        end_at=end_at,
        quantity=quantity,
        status=Reservation.Status.PENDING,
        source=Reservation.Source.ONLINE,
        unit_price=service.price,
        total_price=_total_from_unit_price(service.price, quantity),
        payment_method=payment_method,
        customer_notes=customer_notes,
    )
    ReservationStatusHistory.objects.create(
        reservation=reservation,
        from_status="",
        to_status=reservation.status,
        changed_by=customer,
    )
    return reservation


@transaction.atomic
def create_walk_in(
    *,
    shop_owner,
    shop,
    service,
    start_at,
    staff=None,
    resource=None,
    customer_id=None,
    guest_name="",
    guest_phone="",
    quantity=1,
):
    if shop.owner_id != shop_owner.id:
        raise ValidationError("You do not own this shop.")

    quantity = _validate_quantity(service, quantity)
    _ensure_not_in_past(start_at)
    end_at = start_at + timedelta(
        minutes=effective_duration_minutes(service, quantity)
    )
    block_end = end_at + timedelta(minutes=service.buffer_minutes)

    if resource is not None:
        # Owner picked a specific Resource: honour it but verify it's free.
        # (Whole function is @transaction.atomic, so this lock holds to commit.)
        if resource.shop_id != shop.id:
            raise ValidationError("Resource does not belong to this shop.")
        from apps.shops.models import Resource

        from .availability import _has_conflict

        list(Resource.objects.select_for_update().filter(pk=resource.pk))
        if _has_conflict(shop, resource, start_at, block_end):
            raise ValidationError("Selected time slot is no longer available.")
    else:
        resource = _allocate_resource(shop, service, start_at, quantity)
        if resource is None:
            raise ValidationError("Selected time slot is no longer available.")

    reservation = Reservation.objects.create(
        customer_id=customer_id,
        shop=shop,
        service=service,
        resource=resource,
        staff=staff,
        start_at=start_at,
        end_at=end_at,
        quantity=quantity,
        status=Reservation.Status.CONFIRMED,
        source=Reservation.Source.WALK_IN,
        unit_price=service.price,
        total_price=_total_from_unit_price(service.price, quantity),
        created_by_shop=True,
        guest_name=guest_name,
        guest_phone=guest_phone,
    )
    ReservationStatusHistory.objects.create(
        reservation=reservation,
        from_status="",
        to_status=reservation.status,
        changed_by=shop_owner,
    )
    return reservation


@transaction.atomic
def reschedule(*, reservation: Reservation, new_start, actor, quantity=None):
    if reservation.status not in (
        Reservation.Status.PENDING,
        Reservation.Status.CONFIRMED,
    ):
        raise ValidationError("Only pending or confirmed reservations can be rescheduled.")

    # Preserve the existing quantity unless the caller explicitly changes it.
    if quantity is None:
        quantity = reservation.quantity
    quantity = _validate_quantity(reservation.service, quantity)

    _ensure_not_in_past(new_start)
    new_end = new_start + timedelta(
        minutes=effective_duration_minutes(reservation.service, quantity)
    )
    block_end = new_end + timedelta(minutes=reservation.service.buffer_minutes)

    # Re-allocate a Resource at the new time. Prefer keeping the current one if
    # it's still free (ignoring this reservation's own occupancy); otherwise
    # take any free Resource. Fail only if the whole shop is full then.
    from .availability import _has_conflict

    from apps.shops.models import Resource

    keep = reservation.resource
    # Lock the shop's Resources so a concurrent booker can't grab the slot
    # between our conflict check and save.
    list(
        Resource.objects.select_for_update()
        .filter(shop=reservation.shop, is_active=True)
        .order_by("id")
    )
    if keep is not None and keep.is_active and not _has_conflict(
        reservation.shop, keep, new_start, block_end,
        exclude_reservation_id=reservation.pk,
    ):
        new_resource = keep
    else:
        new_resource = _allocate_resource(
            reservation.shop,
            reservation.service,
            new_start,
            quantity,
            exclude_reservation_id=reservation.pk,
        )
        if new_resource is None:
            raise ValidationError("Selected time slot is no longer available.")

    old_start = reservation.start_at
    reservation.resource = new_resource
    reservation.start_at = new_start
    reservation.end_at = new_end
    reservation.quantity = quantity
    # Recompute from the price FROZEN at booking, never the live Service.price.
    # A reschedule (even one that changes quantity) must not silently re-price
    # the booking against a price the customer never agreed to.
    reservation.total_price = _total_from_unit_price(
        reservation.unit_price, quantity
    )
    reservation.save(
        update_fields=[
            "resource",
            "start_at",
            "end_at",
            "quantity",
            "total_price",
            "updated_at",
        ]
    )

    ReservationStatusHistory.objects.create(
        reservation=reservation,
        from_status=reservation.status,
        to_status=reservation.status,
        changed_by=actor,
        reason=f"Rescheduled from {old_start.isoformat()} to {new_start.isoformat()}",
    )
    return reservation


@transaction.atomic
def transition(*, reservation: Reservation, to_status: str, actor, reason: str = ""):
    if reservation.status == to_status:
        return reservation
    from_status = reservation.status
    reservation.status = to_status
    if to_status in (
        Reservation.Status.CANCELLED_BY_CUSTOMER,
        Reservation.Status.CANCELLED_BY_SHOP,
    ):
        reservation.cancellation_reason = reason

    if to_status == Reservation.Status.COMPLETED and reservation.source == Reservation.Source.ONLINE:
        rate = _commission_rate_for(reservation.shop)
        amount = (reservation.total_price * rate).quantize(Decimal("0.01"))
        reservation.commission_amount = amount
        period = reservation.start_at.strftime("%Y-%m")
        CommissionLedger.objects.update_or_create(
            reservation=reservation,
            defaults={
                "shop": reservation.shop,
                "amount": amount,
                "rate": rate,
                "period": period,
            },
        )

    reservation.save()
    ReservationStatusHistory.objects.create(
        reservation=reservation,
        from_status=from_status,
        to_status=to_status,
        changed_by=actor,
        reason=reason,
    )
    _apply_strikes_if_needed(reservation, from_status, to_status)
    return reservation


def _apply_strikes_if_needed(reservation, from_status, to_status):
    if reservation.customer is None:
        return
    customer = reservation.customer

    window_hours = (
        reservation.shop.cancellation_window_hours
        if reservation.shop.cancellation_window_hours is not None
        else settings.DEFAULT_CANCELLATION_WINDOW_HOURS
    )
    hours_before_start = (reservation.start_at - timezone.now()).total_seconds() / 3600.0

    earned_strike = False
    if to_status == Reservation.Status.CANCELLED_BY_CUSTOMER and hours_before_start < window_hours:
        customer.cancellation_strikes_90d = (customer.cancellation_strikes_90d or 0) + 1
        earned_strike = True
    if to_status == Reservation.Status.NO_SHOW:
        customer.no_show_count_90d = (customer.no_show_count_90d or 0) + 1
        customer.cancellation_strikes_90d = (customer.cancellation_strikes_90d or 0) + 1
        earned_strike = True

    if earned_strike:
        if customer.cancellation_strikes_90d >= settings.STRIKE_LIMIT:
            customer.restricted_until = timezone.now() + timedelta(days=settings.STRIKE_WINDOW_DAYS)
        customer.save(update_fields=[
            "cancellation_strikes_90d",
            "no_show_count_90d",
            "restricted_until",
        ])
