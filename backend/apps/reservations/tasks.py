"""Celery tasks for reservations: confirmations, reminders, no-show auto-mark, strike decay."""

from datetime import timedelta

from celery import shared_task
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.core.emails import get_frontend_url, send_template_email

from .models import Reservation


def _customer_display_name(user) -> str:
    return user.first_name or user.username or user.email.split("@")[0]


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
        subject=f"Booking confirmed at {reservation.shop.name}",
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
def send_reminder(reservation_id: int) -> str:
    reservation = _load_reservation_for_email(reservation_id)
    if reservation is None:
        return f"reservation {reservation_id} not found"
    if reservation.status not in (Reservation.Status.PENDING, Reservation.Status.CONFIRMED):
        return f"skipping reminder for {reservation_id}: status {reservation.status}"
    if not reservation.customer or not reservation.customer.email:
        return f"reservation {reservation_id}: no customer email"

    sent = send_template_email(
        to=reservation.customer.email,
        subject=f"Reminder: {reservation.shop.name} — {reservation.start_at:%b %d, %H:%M}",
        text_template="emails/booking_reminder.txt",
        html_template="emails/booking_reminder.html",
        context={
            "customer_name": _customer_display_name(reservation.customer),
            "shop": reservation.shop,
            "service": reservation.service,
            "start_at": reservation.start_at,
        },
    )
    return f"reminder sent for reservation {reservation_id}" if sent else f"send failed for {reservation_id}"


@shared_task
def schedule_reminders(reservation_id: int) -> str:
    """Queue 24h and 1h reminders for a reservation, if its start time is far enough out."""
    try:
        reservation = Reservation.objects.get(pk=reservation_id)
    except Reservation.DoesNotExist:
        return f"reservation {reservation_id} not found"

    now = timezone.now()
    reminder_times = [
        (reservation.start_at - timedelta(hours=24), "24h"),
        (reservation.start_at - timedelta(hours=1), "1h"),
    ]
    queued = []
    for eta, label in reminder_times:
        if eta > now:
            send_reminder.apply_async(args=[reservation_id], eta=eta)
            queued.append(label)
    return f"scheduled reminders for {reservation_id}: {', '.join(queued) or 'none'}"


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
