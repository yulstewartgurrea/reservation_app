from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from .models import ChatRoom
from .services import user_can_access_room


class ChatRoomConsumer(AsyncJsonWebsocketConsumer):
    """Per-room socket. Joins `chat.room.<id>` and receives every event for that room.

    The REST endpoints are the source of truth for writes. The consumer only
    broadcasts; clients call REST for send/edit/read/unread.
    """

    async def connect(self):
        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            await self.close(code=4401)
            return

        try:
            room_id = int(self.scope["url_route"]["kwargs"]["room_id"])
        except (KeyError, ValueError, TypeError):
            await self.close(code=4400)
            return

        room = await self._get_room(room_id)
        if room is None or not await self._can_access(user, room):
            await self.close(code=4403)
            return

        self.user = user
        self.room_id = room_id
        self.group_name = f"chat.room.{room_id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        group = getattr(self, "group_name", None)
        if group:
            await self.channel_layer.group_discard(group, self.channel_name)

    async def chat_event(self, event):
        """Handler for `chat.event` messages broadcast by services._broadcast_room."""
        await self.send_json(event["data"])

    @staticmethod
    @database_sync_to_async
    def _get_room(room_id: int):
        return ChatRoom.objects.select_related("shop").filter(pk=room_id).first()

    @staticmethod
    @database_sync_to_async
    def _can_access(user, room):
        return user_can_access_room(user, room)
