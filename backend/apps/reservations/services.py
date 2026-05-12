"""Business logic for creating and transitioning reservations."""

from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .availability import _has_conflict
from .models import CommissionLedger, Reservation, ReservationStatusHistory


def _commission_rate_for(shop) -> Decimal:
    if shop.commission_rate is not None:
        return shop.commission_rate
    return Decimal(str(settings.DEFAULT_COMMISSION_RATE))


def _ensure_no_conflict(shop, staff, start_at, end_at):
    if _has_conflict(shop, staff, start_at, end_at):
        raise ValidationError("Selected time slot is no longer available.")


def _ensure_not_in_past(start_at):
    """Block bookings whose start time has already passed.

    The frontend `min` attribute on the date picker is the friendly UX guard;
    this is the server-side belt-and-suspenders so a determined client can't
    POST a past datetime directly.
    """
    if start_at < timezone.now():
        raise ValidationError("Cannot book a time in the past.")


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
):
    if (msg := _restrictions_for_customer(customer)):
        raise ValidationError(msg)

    _ensure_not_in_past(start_at)
    end_at = start_at + timedelta(minutes=service.duration_minutes)
    block_end = end_at + timedelta(minutes=service.buffer_minutes)
    _ensure_no_conflict(shop, staff, start_at, block_end)

    reservation = Reservation.objects.create(
        customer=customer,
        shop=shop,
        service=service,
        staff=staff,
        start_at=start_at,
        end_at=end_at,
        status=Reservation.Status.PENDING,
        source=Reservation.Source.ONLINE,
        total_price=service.price,
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
    customer_id=None,
    guest_name="",
    guest_phone="",
):
    if shop.owner_id != shop_owner.id:
        raise ValidationError("You do not own this shop.")

    _ensure_not_in_past(start_at)
    end_at = start_at + timedelta(minutes=service.duration_minutes)
    block_end = end_at + timedelta(minutes=service.buffer_minutes)
    _ensure_no_conflict(shop, staff, start_at, block_end)

    reservation = Reservation.objects.create(
        customer_id=customer_id,
        shop=shop,
        service=service,
        staff=staff,
        start_at=start_at,
        end_at=end_at,
        status=Reservation.Status.CONFIRMED,
        source=Reservation.Source.WALK_IN,
        total_price=service.price,
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
def reschedule(*, reservation: Reservation, new_start, actor):
    if reservation.status not in (
        Reservation.Status.PENDING,
        Reservation.Status.CONFIRMED,
    ):
        raise ValidationError("Only pending or confirmed reservations can be rescheduled.")

    _ensure_not_in_past(new_start)
    new_end = new_start + timedelta(minutes=reservation.service.duration_minutes)
    block_end = new_end + timedelta(minutes=reservation.service.buffer_minutes)

    blocking = Reservation.objects.filter(
        shop=reservation.shop,
        status__in=[
            Reservation.Status.PENDING,
            Reservation.Status.CONFIRMED,
            Reservation.Status.COMPLETED,
        ],
        start_at__lt=block_end,
        end_at__gt=new_start,
    ).exclude(pk=reservation.pk)
    if reservation.staff_id:
        blocking = blocking.filter(staff_id=reservation.staff_id)
    if blocking.exists():
        raise ValidationError("Selected time slot is no longer available.")

    old_start = reservation.start_at
    reservation.start_at = new_start
    reservation.end_at = new_end
    reservation.save(update_fields=["start_at", "end_at", "updated_at"])

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
