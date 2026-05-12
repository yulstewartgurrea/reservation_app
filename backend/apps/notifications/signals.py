"""Listen to Reservation lifecycle events and emit notifications + emails."""

from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.reservations.models import Reservation, ReservationStatusHistory

from .models import Notification
from .services import push_to_shop, push_to_user


@receiver(post_save, sender=Reservation)
def on_reservation_created(sender, instance: Reservation, created: bool, **kwargs):
    if not created:
        return

    from apps.reservations.tasks import send_booking_confirmation_email, schedule_reminders

    when = instance.start_at.strftime("%Y-%m-%d %H:%M")

    if instance.source == Reservation.Source.ONLINE:
        push_to_shop(
            shop=instance.shop,
            kind=Notification.Kind.BOOKING_NEW,
            title=f"New booking: {instance.service.name}",
            body=f"{_who(instance)} at {when}",
            payload={"reservation_id": instance.id},
        )
        if instance.customer_id:
            push_to_user(
                user=instance.customer,
                kind=Notification.Kind.BOOKING_NEW,
                title=f"Booking requested at {instance.shop.name}",
                body=f"{instance.service.name} — {when}",
                payload={"reservation_id": instance.id},
            )
            send_booking_confirmation_email.delay(instance.id)
            schedule_reminders.delay(instance.id)


@receiver(post_save, sender=ReservationStatusHistory)
def on_status_change(sender, instance: ReservationStatusHistory, created: bool, **kwargs):
    if not created or instance.from_status == "":
        return

    reservation = instance.reservation
    when = reservation.start_at.strftime("%Y-%m-%d %H:%M")
    to_status = instance.to_status

    kind_map = {
        Reservation.Status.CONFIRMED: Notification.Kind.BOOKING_CONFIRMED,
        Reservation.Status.COMPLETED: Notification.Kind.BOOKING_COMPLETED,
        Reservation.Status.CANCELLED_BY_CUSTOMER: Notification.Kind.BOOKING_CANCELLED,
        Reservation.Status.CANCELLED_BY_SHOP: Notification.Kind.BOOKING_CANCELLED,
        Reservation.Status.NO_SHOW: Notification.Kind.BOOKING_NO_SHOW,
    }
    kind = kind_map.get(to_status)
    if kind is None:
        return

    title = f"{reservation.shop.name}: {to_status.replace('_', ' ')}"
    body = f"{reservation.service.name} — {when}"
    payload = {"reservation_id": reservation.id, "status": to_status}

    if reservation.customer_id:
        push_to_user(
            user=reservation.customer,
            kind=kind,
            title=title,
            body=body,
            payload=payload,
        )
    push_to_shop(
        shop=reservation.shop,
        kind=kind,
        title=f"{_who(reservation)}: {to_status.replace('_', ' ')}",
        body=body,
        payload=payload,
    )


def _who(reservation: Reservation) -> str:
    if reservation.customer_id:
        return reservation.customer.email
    return reservation.guest_name or "Guest"
