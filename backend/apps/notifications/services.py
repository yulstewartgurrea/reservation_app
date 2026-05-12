"""Helpers to push notifications: persist to DB + fan out over WebSocket."""

from __future__ import annotations

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from .models import Notification


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
