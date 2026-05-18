"""Celery tasks for reservations: confirmations, reminders, no-show auto-mark, strike decay."""

from datetime import timedelta

from celery import shared_task
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.core.emails import get_frontend_url, send_template_email

from .models import Reservation, ReservationReminder

# How long after a reminder's intended fire time we'll still send it. Must
# exceed the Beat interval so a missed tick doesn't drop a reminder, yet be
# short enough that a same-day booking never triggers a stale "24h" reminder.
REMINDER_LATE_GRACE = timedelta(minutes=20)

_REMINDABLE_STATUSES = (Reservation.Status.PENDING, Reservation.Status.CONFIRMED)

_OFFSETS = {
    ReservationReminder.Offset.DAY: timedelta(hours=24),
    ReservationReminder.Offset.HOUR: timedelta(hours=1),
}


def _customer_display_name(user) -> str:
    return user.first_name or user.username or user.email.split("@")[0]


def _payment_label(reservation: Reservation) -> str:
    """Human-readable payment line for receipt emails."""
    if reservation.payment_method == Reservation.PaymentMethod.ONLINE:
        return "paid online"
    return "pay on arrival"


def _load_reservation_for_email(reservation_id: int) -> Reservation | None:
    try:
        return Reservation.objects.select_related("shop", "service", "customer").get(
            pk=reservation_id
        )
    except Reservation.DoesNotExist:
        return None


@shared_task
def send_booking_confirmation_email(reservation_id: int) -> str:
    reservation = _load_reservation_for_email(reservation_id)
    if reservation is None:
        return f"reservation {reservation_id} not found"
    if not reservation.customer or not reservation.customer.email:
        return f"reservation {reservation_id}: no customer email"

    sent = send_template_email(
        to=reservation.customer.email,
        subject=f"We received your booking at {reservation.shop.name}",
        text_template="emails/booking_confirmation.txt",
        html_template="emails/booking_confirmation.html",
        context={
            "customer_name": _customer_display_name(reservation.customer),
            "shop": reservation.shop,
            "service": reservation.service,
            "start_at": reservation.start_at,
            "frontend_url": get_frontend_url(),
        },
    )
    return f"confirmation sent for reservation {reservation_id}" if sent else f"send failed for {reservation_id}"


@shared_task
def send_booking_confirmed_email(reservation_id: int) -> str:
    """Receipt sent when the shop owner *confirms* a pending appointment."""
    reservation = _load_reservation_for_email(reservation_id)
    if reservation is None:
        return f"reservation {reservation_id} not found"
    if not reservation.customer or not reservation.customer.email:
        return f"reservation {reservation_id}: no customer email"

    sent = send_template_email(
        to=reservation.customer.email,
        subject=f"Appointment confirmed at {reservation.shop.name}",
        text_template="emails/booking_confirmed.txt",
        html_template="emails/booking_confirmed.html",
        context={
            "customer_name": _customer_display_name(reservation.customer),
            "shop": reservation.shop,
            "service": reservation.service,
            "start_at": reservation.start_at,
            "total_price": reservation.total_price,
            "payment_label": _payment_label(reservation),
            "frontend_url": get_frontend_url(),
        },
    )
    return f"confirmed receipt sent for {reservation_id}" if sent else f"send failed for {reservation_id}"


@shared_task
def send_booking_completed_email(reservation_id: int) -> str:
    """Receipt sent when the shop owner marks an appointment *completed*."""
    reservation = _load_reservation_for_email(reservation_id)
    if reservation is None:
        return f"reservation {reservation_id} not found"
    if not reservation.customer or not reservation.customer.email:
        return f"reservation {reservation_id}: no customer email"

    sent = send_template_email(
        to=reservation.customer.email,
        subject=f"Service completed at {reservation.shop.name} — your receipt",
        text_template="emails/booking_completed.txt",
        html_template="emails/booking_completed.html",
        context={
            "customer_name": _customer_display_name(reservation.customer),
            "shop": reservation.shop,
            "service": reservation.service,
            "start_at": reservation.start_at,
            "total_price": reservation.total_price,
            "payment_label": _payment_label(reservation),
            "frontend_url": get_frontend_url(),
        },
    )
    return f"completed receipt sent for {reservation_id}" if sent else f"send failed for {reservation_id}"


@shared_task
def send_reminder(reservation_id: int, offset: str) -> str:
    """Email the customer and the shop owner a single reminder.

    Idempotent: a `ReservationReminder(reservation, offset)` row is the
    dedup key, so re-running the scanner (or a duplicated task) never
    double-sends the same lead-time reminder.
    """
    from django.db import IntegrityError

    reservation = _load_reservation_for_email(reservation_id)
    if reservation is None:
        return f"reservation {reservation_id} not found"
    if reservation.status not in _REMINDABLE_STATUSES:
        return f"skipping {offset} reminder for {reservation_id}: status {reservation.status}"

    try:
        _, created = ReservationReminder.objects.get_or_create(
            reservation=reservation, offset=offset
        )
    except IntegrityError:
        created = False
    if not created:
        return f"{offset} reminder already sent for {reservation_id}"

    shop = reservation.shop
    service = reservation.service
    start_at = reservation.start_at
    when = f"{start_at:%b %d, %H:%M}"
    customer = reservation.customer
    sent_to = []

    if customer and customer.email:
        if send_template_email(
            to=customer.email,
            subject=f"Reminder: {shop.name} — {when}",
            text_template="emails/booking_reminder.txt",
            html_template="emails/booking_reminder.html",
            context={
                "customer_name": _customer_display_name(customer),
                "shop": shop,
                "service": service,
                "start_at": start_at,
            },
        ):
            sent_to.append("customer")

    owner = shop.owner
    if owner and owner.email:
        if send_template_email(
            to=owner.email,
            subject=f"Upcoming appointment at {shop.name} — {when}",
            text_template="emails/owner_reminder.txt",
            html_template="emails/owner_reminder.html",
            context={
                "owner_name": _customer_display_name(owner),
                "customer_name": (
                    _customer_display_name(customer)
                    if customer
                    else (reservation.guest_name or "a guest")
                ),
                "shop": shop,
                "service": service,
                "start_at": start_at,
                "frontend_url": get_frontend_url(),
            },
        ):
            sent_to.append("shop_owner")

    return f"{offset} reminder for {reservation_id} sent to: {', '.join(sent_to) or 'no one'}"


@shared_task
def dispatch_due_reminders() -> str:
    """Beat task: find reservations whose 24h / 1h reminder is due and queue
    a `send_reminder` for each. Runs every few minutes; the late-grace window
    plus the per-(reservation, offset) dedup row make it self-correcting if a
    Beat tick is missed, and harmless if it overlaps.
    """
    now = timezone.now()
    dispatched = 0
    for offset_key, delta in _OFFSETS.items():
        window_start = now + delta - REMINDER_LATE_GRACE
        window_end = now + delta
        due_ids = (
            Reservation.objects.filter(
                status__in=_REMINDABLE_STATUSES,
                customer__isnull=False,
                start_at__gt=now,
                start_at__gte=window_start,
                start_at__lte=window_end,
            )
            .exclude(reminders__offset=offset_key)
            .values_list("id", flat=True)
        )
        for rid in due_ids:
            send_reminder.delay(rid, offset_key)
            dispatched += 1
    return f"dispatched {dispatched} reminder task(s)"


@shared_task
def auto_mark_no_shows() -> str:
    """Mark CONFIRMED reservations whose end time passed >grace ago as no_show."""
    grace = timedelta(minutes=15)
    cutoff = timezone.now() - grace
    qs = Reservation.objects.filter(
        status=Reservation.Status.CONFIRMED,
        end_at__lt=cutoff,
    )
    from .services import transition

    count = 0
    for reservation in qs:
        transition(reservation=reservation, to_status=Reservation.Status.NO_SHOW, actor=None)
        count += 1
    return f"auto-no-show: {count}"


@shared_task
def decay_strikes() -> str:
    """Clear `restricted_until` values that have elapsed."""
    User = get_user_model()
    now = timezone.now()
    cleared = User.objects.filter(restricted_until__lt=now).update(restricted_until=None)
    return f"strike decay: cleared {cleared} restrictions"
