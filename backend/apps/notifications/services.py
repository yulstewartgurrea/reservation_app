"""Helpers to push notifications: persist to DB + fan out over WebSocket.

Also home to the maintenance-reminder dispatcher, which fires due reminders
via email + in-app notification and rolls each one forward by its interval.
"""

from __future__ import annotations

from datetime import timedelta

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction
from django.utils import timezone

from .models import MaintenanceReminder, Notification


def push_to_user(*, user, kind: str, title: str, body: str = "", payload: dict | None = None) -> Notification:
    payload = payload or {}
    notification = Notification.objects.create(
        user=user,
        kind=kind,
        title=title,
        body=body,
        payload=payload,
    )
    _send_ws(group=f"user.{user.id}", kind=kind, title=title, body=body, payload=payload)
    return notification


def push_to_shop(*, shop, kind: str, title: str, body: str = "", payload: dict | None = None) -> None:
    """Send a transient WebSocket message to all listeners on a shop's group.

    Persists a Notification row for the shop owner (so it shows up in their list),
    then fans out via the shop group so any open dashboards refresh.
    """
    payload = payload or {}
    Notification.objects.create(
        user=shop.owner,
        kind=kind,
        title=title,
        body=body,
        payload=payload,
    )
    _send_ws(group=f"shop.{shop.id}", kind=kind, title=title, body=body, payload=payload)


def _advance_next_due(reminder: MaintenanceReminder, *, from_dt) -> None:
    """Roll `next_due_at` forward by interval_months. Uses a 30-day approximation
    to avoid pulling in dateutil — close enough for "every 6 months" cadences."""
    reminder.next_due_at = from_dt + timedelta(days=30 * reminder.interval_months)


def dispatch_due_maintenance_reminders() -> dict:
    """Send all active reminders whose next_due_at has passed.

    Idempotent-ish: after sending, we advance `next_due_at` and set
    `last_sent_at`, so the same reminder won't fire again until the
    next interval rolls around.
    """
    from .emails import send_maintenance_reminder_email  # local import — avoid app-load cycle

    now = timezone.now()
    qs = MaintenanceReminder.objects.select_related("shop", "customer", "service").filter(
        is_active=True, next_due_at__lte=now
    )

    sent = 0
    failed = 0
    for reminder in qs:
        try:
            email_ok = send_maintenance_reminder_email(reminder)
        except Exception:
            email_ok = False

        try:
            push_to_user(
                user=reminder.customer,
                kind=Notification.Kind.REMINDER,
                title=f"{reminder.shop.name}: {reminder.title} is due",
                body=reminder.message or f"It's time for your {reminder.title.lower()}.",
                payload={
                    "maintenance_reminder_id": reminder.id,
                    "shop_id": reminder.shop_id,
                },
            )
        except Exception:
            # in-app notification failure shouldn't block the rollover
            pass

        with transaction.atomic():
            reminder.last_sent_at = now
            _advance_next_due(reminder, from_dt=now)
            reminder.save(update_fields=["last_sent_at", "next_due_at", "updated_at"])

        if email_ok:
            sent += 1
        else:
            failed += 1

    return {"sent": sent, "failed": failed}


def _send_ws(*, group: str, kind: str, title: str, body: str, payload: dict) -> None:
    layer = get_channel_layer()
    if layer is None:
        return
    async_to_sync(layer.group_send)(
        group,
        {
            "type": "notify",
            "data": {"kind": kind, "title": title, "body": body, "payload": payload},
        },
    )
