"""Chat business logic. Views/consumers stay thin and delegate here."""

from __future__ import annotations

from typing import Iterable

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone

from apps.shops.models import Shop

from .models import ChatParticipant, ChatRoom, Message

User = get_user_model()


# --- room access ----------------------------------------------------------

def open_room_for_customer(*, customer, shop: Shop) -> ChatRoom:
    """Get-or-create the room between a customer and a shop. Customer initiates."""
    if shop.status != Shop.Status.ACTIVE:
        raise PermissionError("Cannot chat with a shop that is not active.")

    with transaction.atomic():
        room, _ = ChatRoom.objects.get_or_create(customer=customer, shop=shop)
        _ensure_participants(room)
    return room


def user_can_access_room(user, room: ChatRoom) -> bool:
    if user.id == room.customer_id:
        return True
    if user.id == room.shop.owner_id:
        return True
    return False


def _ensure_participants(room: ChatRoom) -> None:
    """Idempotently create participant rows for the customer and shop owner."""
    ChatParticipant.objects.get_or_create(room=room, user_id=room.customer_id)
    ChatParticipant.objects.get_or_create(room=room, user_id=room.shop.owner_id)


def get_participant(*, room: ChatRoom, user) -> ChatParticipant:
    _ensure_participants(room)
    return ChatParticipant.objects.get(room=room, user=user)


# --- messaging ------------------------------------------------------------

def send_message(*, room: ChatRoom, sender, body: str) -> Message:
    if not user_can_access_room(sender, room):
        raise PermissionError("Not a participant of this room.")
    body = (body or "").strip()
    if not body:
        raise ValueError("Message body cannot be empty.")

    with transaction.atomic():
        msg = Message.objects.create(room=room, sender=sender, body=body)
        ChatRoom.objects.filter(pk=room.pk).update(last_message_at=msg.created_at)
        # Sender has implicitly read their own message
        ChatParticipant.objects.filter(room=room, user=sender).update(last_read_message=msg)

    _broadcast_room(room, {"type": "chat.message", "message": _serialize(msg)})
    _notify_recipients(room=room, sender=sender, msg=msg)
    return msg


def edit_message(*, message: Message, user, body: str) -> Message:
    if message.sender_id != user.id:
        raise PermissionError("Only the sender can edit a message.")
    if message.is_deleted:
        raise ValueError("Cannot edit a deleted message.")
    body = (body or "").strip()
    if not body:
        raise ValueError("Message body cannot be empty.")

    message.body = body
    message.edited_at = timezone.now()
    message.save(update_fields=["body", "edited_at"])
    _broadcast_room(message.room, {"type": "chat.message_edited", "message": _serialize(message)})
    return message


# --- read state -----------------------------------------------------------

def mark_read_up_to(*, room: ChatRoom, user, message_id: int) -> ChatParticipant:
    """Move the user's read cursor forward to `message_id` (or further)."""
    target = Message.objects.get(pk=message_id, room=room)
    participant = get_participant(room=room, user=user)
    current_id = participant.last_read_message_id or 0
    if target.id > current_id:
        participant.last_read_message = target
        participant.save(update_fields=["last_read_message"])
        _broadcast_room(
            room,
            {
                "type": "chat.read_state",
                "user_id": user.id,
                "last_read_message_id": target.id,
            },
        )
    return participant


def mark_unread_from(*, room: ChatRoom, user, message_id: int) -> ChatParticipant:
    """Mark `message_id` (and everything after it) as unread for this user.

    Implementation: rewind the read cursor to the predecessor of the target message.
    If there is no predecessor in the room, set the cursor to null.
    """
    target = Message.objects.get(pk=message_id, room=room)
    predecessor = (
        Message.objects.filter(room=room, id__lt=target.id).order_by("-id").first()
    )
    participant = get_participant(room=room, user=user)
    participant.last_read_message = predecessor  # may be None
    participant.save(update_fields=["last_read_message"])
    _broadcast_room(
        room,
        {
            "type": "chat.read_state",
            "user_id": user.id,
            "last_read_message_id": predecessor.id if predecessor else None,
        },
    )
    return participant


def unread_count_for_room(*, room: ChatRoom, user) -> int:
    participant = get_participant(room=room, user=user)
    qs = Message.objects.filter(room=room).exclude(sender=user)
    if participant.last_read_message_id:
        qs = qs.filter(id__gt=participant.last_read_message_id)
    return qs.count()


def total_unread_for_user(*, user) -> int:
    """Sum of unread messages across every room the user participates in."""
    parts = ChatParticipant.objects.filter(user=user).select_related("room")
    total = 0
    for p in parts:
        qs = Message.objects.filter(room_id=p.room_id).exclude(sender=user)
        if p.last_read_message_id:
            qs = qs.filter(id__gt=p.last_read_message_id)
        total += qs.count()
    return total


# --- room listing ---------------------------------------------------------

def list_rooms_for_user(*, user) -> Iterable[ChatRoom]:
    return (
        ChatRoom.objects.filter(
            Q(customer=user) | Q(shop__owner=user)
        )
        .select_related("customer", "shop", "shop__owner")
        .prefetch_related("messages")
        .distinct()
        .order_by("-last_message_at", "-created_at")
    )


# --- WS plumbing ---------------------------------------------------------

def _broadcast_room(room: ChatRoom, payload: dict) -> None:
    layer = get_channel_layer()
    if layer is None:
        return
    async_to_sync(layer.group_send)(
        f"chat.room.{room.id}",
        {"type": "chat.event", "data": payload},
    )


def _notify_recipients(*, room: ChatRoom, sender, msg: Message) -> None:
    """Push a lightweight `chat.new_message` event onto each recipient's user.<id>
    group so their global unread badge updates without an open room socket."""
    layer = get_channel_layer()
    if layer is None:
        return
    recipient_ids = {room.customer_id, room.shop.owner_id} - {sender.id}
    for uid in recipient_ids:
        async_to_sync(layer.group_send)(
            f"user.{uid}",
            {
                "type": "notify",
                "data": {
                    "kind": "chat.new_message",
                    "title": "New message",
                    "body": msg.body[:120],
                    "payload": {"room_id": room.id, "message_id": msg.id},
                },
            },
        )


def _serialize(msg: Message) -> dict:
    return {
        "id": msg.id,
        "room_id": msg.room_id,
        "sender_id": msg.sender_id,
        "body": msg.body,
        "edited_at": msg.edited_at.isoformat() if msg.edited_at else None,
        "created_at": msg.created_at.isoformat(),
    }
