import asyncio

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.utils import timezone

from apps.chat.presence import (
    PRESENCE_REFRESH_SECONDS,
    broadcast_presence,
    is_online,
    mark_offline,
    mark_online,
    refresh_online,
)

# Short window during which a disconnect waits before flipping the user
# offline — absorbs page navigations and quick reconnects so we don't
# blink the green dot on every refresh.
OFFLINE_GRACE_SECONDS = 5


class UserNotificationConsumer(AsyncJsonWebsocketConsumer):
    """One channel per authenticated user, plus a per-shop group for shop owners.

    Group naming:
      - user.<id>          (always joined when authenticated)
      - shop.<id>          (joined for each shop the user owns)

    Also responsible for online-presence: marks the user online on connect,
    refreshes the Redis TTL on a heartbeat, and clears it on disconnect.
    Broadcasts presence transitions to every chat peer.
    """

    async def connect(self):
        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            await self.close(code=4401)
            return

        self.user = user
        self.user_group = f"user.{user.id}"
        await self.channel_layer.group_add(self.user_group, self.channel_name)

        if user.is_shop_owner:
            self.shop_groups = await self._owned_shop_groups(user.id)
            for group in self.shop_groups:
                await self.channel_layer.group_add(group, self.channel_name)
        else:
            self.shop_groups = []

        await self.accept()

        was_online = await database_sync_to_async(is_online)(user.id)
        await mark_online(user.id)
        await self._touch_last_seen(user.id)
        if not was_online:
            await database_sync_to_async(broadcast_presence)(
                user.id, is_online_now=True, last_seen_at=None
            )

        self._heartbeat_task = asyncio.create_task(self._heartbeat())

    async def disconnect(self, code):
        task = getattr(self, "_heartbeat_task", None)
        if task:
            task.cancel()

        if hasattr(self, "user_group"):
            await self.channel_layer.group_discard(self.user_group, self.channel_name)
        for group in getattr(self, "shop_groups", []):
            await self.channel_layer.group_discard(group, self.channel_name)

        user = getattr(self, "user", None)
        if user is not None:
            asyncio.create_task(self._offline_after_grace(user.id))

    async def notify(self, event):
        await self.send_json(event["data"])

    async def _heartbeat(self):
        try:
            while True:
                await asyncio.sleep(PRESENCE_REFRESH_SECONDS)
                await refresh_online(self.user.id)
        except asyncio.CancelledError:
            return

    async def _offline_after_grace(self, user_id: int):
        try:
            await asyncio.sleep(OFFLINE_GRACE_SECONDS)
        except asyncio.CancelledError:
            return
        # If another socket reconnected during the grace period, the key
        # was just refreshed by it — leave it alone.
        still_online = await database_sync_to_async(is_online)(user_id)
        if still_online:
            return
        await mark_offline(user_id)
        last_seen = await self._touch_last_seen(user_id)
        await database_sync_to_async(broadcast_presence)(
            user_id, is_online_now=False, last_seen_at=last_seen
        )

    @staticmethod
    @database_sync_to_async
    def _touch_last_seen(user_id: int):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        now = timezone.now()
        User.objects.filter(pk=user_id).update(last_seen_at=now)
        return now

    @staticmethod
    async def _owned_shop_groups(user_id: int) -> list[str]:
        from apps.shops.models import Shop

        @database_sync_to_async
        def fetch():
            return list(Shop.objects.filter(owner_id=user_id).values_list("id", flat=True))

        ids = await fetch()
        return [f"shop.{i}" for i in ids]
