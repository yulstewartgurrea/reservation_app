import json

from channels.generic.websocket import AsyncJsonWebsocketConsumer


class UserNotificationConsumer(AsyncJsonWebsocketConsumer):
    """One channel per authenticated user, plus a per-shop group for shop owners.

    Group naming:
      - user.<id>          (always joined when authenticated)
      - shop.<id>          (joined for each shop the user owns)
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

    async def disconnect(self, code):
        if hasattr(self, "user_group"):
            await self.channel_layer.group_discard(self.user_group, self.channel_name)
        for group in getattr(self, "shop_groups", []):
            await self.channel_layer.group_discard(group, self.channel_name)

    async def notify(self, event):
        await self.send_json(event["data"])

    @staticmethod
    async def _owned_shop_groups(user_id: int) -> list[str]:
        from channels.db import database_sync_to_async
        from apps.shops.models import Shop

        @database_sync_to_async
        def fetch():
            return list(Shop.objects.filter(owner_id=user_id).values_list("id", flat=True))

        ids = await fetch()
        return [f"shop.{i}" for i in ids]
