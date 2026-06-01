from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from .models import ChatRoom
from .services import user_can_access_room


class ChatRoomConsumer(AsyncJsonWebsocketConsumer):
    """Per-room socket. Joins `chat.room.<id>` and receives every event for that room.

    The REST endpoints are the source of truth for writes. The consumer
    broadcasts new messages and also accepts inbound transient events
    (typing) which it fans out to the room and to the other party's
    `user.<id>` channel so the sidebar can react too.
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
        self.room = room
        self.room_id = room_id
        self.group_name = f"chat.room.{room_id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        group = getattr(self, "group_name", None)
        if group:
            await self.channel_layer.group_discard(group, self.channel_name)

    async def receive_json(self, content, **kwargs):
        """Inbound transient events from the client. Currently only `typing`."""
        if not isinstance(content, dict):
            return
        if content.get("type") == "typing":
            is_typing = bool(content.get("is_typing", True))
            await self._fanout_typing(is_typing)

    async def chat_event(self, event):
        """Handler for `chat.event` messages broadcast by services._broadcast_room."""
        await self.send_json(event["data"])

    async def _fanout_typing(self, is_typing: bool) -> None:
        room = getattr(self, "room", None)
        if room is None:
            return
        payload = {
            "type": "chat.typing",
            "room_id": self.room_id,
            "user_id": self.user.id,
            "is_typing": is_typing,
        }
        # Other open clients in the same room.
        await self.channel_layer.group_send(
            self.group_name,
            {"type": "chat.event", "data": payload},
        )
        # Recipient's user channel so the chat sidebar picks it up even if
        # they don't have the room open.
        other_id = await self._other_party_id(room, self.user.id)
        if other_id:
            await self.channel_layer.group_send(
                f"user.{other_id}",
                {
                    "type": "notify",
                    "data": {
                        "kind": "chat.typing",
                        "title": "",
                        "body": "",
                        "payload": {
                            "room_id": self.room_id,
                            "user_id": self.user.id,
                            "is_typing": is_typing,
                        },
                    },
                },
            )

    @staticmethod
    @database_sync_to_async
    def _get_room(room_id: int):
        return ChatRoom.objects.select_related("shop").filter(pk=room_id).first()

    @staticmethod
    @database_sync_to_async
    def _can_access(user, room):
        return user_can_access_room(user, room)

    @staticmethod
    @database_sync_to_async
    def _other_party_id(room: ChatRoom, sender_id: int) -> int | None:
        if sender_id == room.customer_id:
            return room.shop.owner_id
        if sender_id == room.shop.owner_id:
            return room.customer_id
        return None
