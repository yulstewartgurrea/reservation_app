"""Online-presence tracking, backed by Redis.

Each connected `UserNotificationConsumer` calls `mark_online(user_id)` on
connect and `mark_offline(user_id)` on disconnect. The state is stored under
`presence:user:<id>` with a TTL so a crashed client times out naturally
(no orphan "online forever" state).

`is_online(user_id)` is a sync helper for serializers; consumers use the
async variants to avoid blocking the event loop.

`peers_to_notify(user_id)` returns the user IDs that share at least one
ChatRoom with `user_id` — used to fan out presence changes only to people
who care.
"""

from __future__ import annotations

from typing import Iterable

import redis
import redis.asyncio as aioredis
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.db.models import Q

# How long a presence key lives without a refresh. The consumer pings
# every PRESENCE_REFRESH_SECONDS while alive, so a missed window means
# the socket really is gone.
PRESENCE_TTL_SECONDS = 60
PRESENCE_REFRESH_SECONDS = 25


def _key(user_id: int) -> str:
    return f"presence:user:{user_id}"


# --- sync (for serializers, views) ---------------------------------------

_sync_client: redis.Redis | None = None


def _sync_redis() -> redis.Redis:
    global _sync_client
    if _sync_client is None:
        _sync_client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _sync_client


def is_online(user_id: int) -> bool:
    if not user_id:
        return False
    try:
        return bool(_sync_redis().exists(_key(user_id)))
    except redis.RedisError:
        return False


def online_user_ids(user_ids: Iterable[int]) -> set[int]:
    """Bulk-check; returns the subset that are online. Skips Redis on empty."""
    ids = list(user_ids)
    if not ids:
        return set()
    try:
        client = _sync_redis()
        pipe = client.pipeline()
        for uid in ids:
            pipe.exists(_key(uid))
        results = pipe.execute()
    except redis.RedisError:
        return set()
    return {uid for uid, exists in zip(ids, results) if exists}


# --- async (for consumers) -----------------------------------------------

_async_client: aioredis.Redis | None = None


def _async_redis() -> aioredis.Redis:
    global _async_client
    if _async_client is None:
        _async_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _async_client


async def mark_online(user_id: int) -> None:
    try:
        await _async_redis().set(_key(user_id), "1", ex=PRESENCE_TTL_SECONDS)
    except Exception:  # noqa: BLE001 — presence is best-effort
        pass


async def refresh_online(user_id: int) -> None:
    """Push the TTL forward without changing the value."""
    await mark_online(user_id)


async def mark_offline(user_id: int) -> None:
    try:
        await _async_redis().delete(_key(user_id))
    except Exception:  # noqa: BLE001
        pass


# --- peer fan-out ---------------------------------------------------------

def peers_to_notify(user_id: int) -> list[int]:
    """User IDs that share at least one ChatRoom with `user_id`.

    Cheap O(rooms) query; we keep it as a list so the caller can iterate
    deterministically when broadcasting.
    """
    from .models import ChatRoom

    rooms = ChatRoom.objects.filter(
        Q(customer_id=user_id) | Q(shop__owner_id=user_id)
    ).select_related("shop")

    peers: set[int] = set()
    for room in rooms:
        peers.add(room.customer_id)
        peers.add(room.shop.owner_id)
    peers.discard(user_id)
    return sorted(peers)


def broadcast_presence(user_id: int, *, is_online_now: bool, last_seen_at=None) -> None:
    """Fan out a `presence.update` event to every chat peer of `user_id`.

    Sent on the recipient's `user.<id>` notifications channel so the sidebar
    and any open chat room pick it up.
    """
    layer = get_channel_layer()
    if layer is None:
        return
    payload = {
        "kind": "presence.update",
        "title": "",
        "body": "",
        "payload": {
            "user_id": user_id,
            "is_online": is_online_now,
            "last_seen_at": last_seen_at.isoformat() if last_seen_at else None,
        },
    }
    for peer_id in peers_to_notify(user_id):
        async_to_sync(layer.group_send)(
            f"user.{peer_id}",
            {"type": "notify", "data": payload},
        )
