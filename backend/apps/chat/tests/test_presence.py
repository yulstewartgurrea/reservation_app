"""Tests for presence + typing fan-out.

The Redis client is mocked so tests don't need a live redis. Channel
broadcasting uses the in-memory channel layer configured in test_settings.
"""

import asyncio
from unittest.mock import patch

from asgiref.sync import sync_to_async
from channels.layers import get_channel_layer
from channels.testing import WebsocketCommunicator
from django.test import TestCase, TransactionTestCase

from apps.chat import presence, services
from apps.chat.consumers import ChatRoomConsumer
from apps.chat.serializers import ChatRoomSerializer
from apps.core.test_factories import make_customer, make_shop, make_shop_owner


class FakeRedis:
    """Tiny stand-in for the synchronous redis.Redis client used by presence."""

    def __init__(self):
        self.store: set[str] = set()

    def exists(self, key: str) -> int:
        return 1 if key in self.store else 0

    def pipeline(self):
        outer = self

        class P:
            def __init__(self):
                self.cmds: list[str] = []

            def exists(self, key: str):
                self.cmds.append(key)
                return self

            def execute(self):
                return [1 if k in outer.store else 0 for k in self.cmds]

        return P()


class PresenceHelperTests(TestCase):
    def setUp(self):
        self.fake = FakeRedis()
        self.patcher = patch.object(presence, "_sync_redis", return_value=self.fake)
        self.patcher.start()
        self.addCleanup(self.patcher.stop)

    def test_is_online_reads_from_redis(self):
        self.fake.store.add(presence._key(42))
        self.assertTrue(presence.is_online(42))
        self.assertFalse(presence.is_online(7))

    def test_online_user_ids_bulk(self):
        self.fake.store.update({presence._key(1), presence._key(3)})
        self.assertEqual(presence.online_user_ids([1, 2, 3]), {1, 3})

    def test_online_user_ids_empty_input(self):
        self.assertEqual(presence.online_user_ids([]), set())


class PeersToNotifyTests(TestCase):
    def test_peers_are_chat_room_counterparts(self):
        owner = make_shop_owner()
        shop = make_shop(owner=owner)
        customer_a = make_customer()
        customer_b = make_customer()
        services.open_room_for_customer(customer=customer_a, shop=shop)
        services.open_room_for_customer(customer=customer_b, shop=shop)

        peers = presence.peers_to_notify(owner.id)
        self.assertEqual(set(peers), {customer_a.id, customer_b.id})
        self.assertEqual(presence.peers_to_notify(customer_a.id), [owner.id])

    def test_user_with_no_rooms_has_no_peers(self):
        loner = make_customer()
        self.assertEqual(presence.peers_to_notify(loner.id), [])


class ChatRoomSerializerPresenceTests(TestCase):
    def setUp(self):
        self.customer = make_customer()
        self.shop = make_shop()
        self.owner = self.shop.owner
        self.room = services.open_room_for_customer(customer=self.customer, shop=self.shop)

    def _serialize_as(self, user):
        from rest_framework.test import APIRequestFactory

        request = APIRequestFactory().get("/")
        request.user = user
        return ChatRoomSerializer(self.room, context={"request": request}).data

    def test_other_party_id_is_counterpart(self):
        with patch.object(presence, "is_online", return_value=False):
            data_for_customer = self._serialize_as(self.customer)
            data_for_owner = self._serialize_as(self.owner)
        self.assertEqual(data_for_customer["other_party_id"], self.owner.id)
        self.assertEqual(data_for_owner["other_party_id"], self.customer.id)

    def test_other_party_online_reflects_redis(self):
        with patch("apps.chat.serializers.is_online", return_value=True) as is_online_mock:
            data = self._serialize_as(self.customer)
        self.assertTrue(data["other_party_online"])
        is_online_mock.assert_called_with(self.owner.id)


class ChatRoomConsumerTypingTests(TransactionTestCase):
    """Inbound typing event fans out to both the room group and the
    other party's user.<id> notifications group."""

    def test_typing_event_fans_out(self):
        asyncio.run(self._run())

    async def _run(self):
        customer = await sync_to_async(make_customer)()
        owner = await sync_to_async(make_shop_owner)()
        shop = await sync_to_async(make_shop)(owner=owner)
        room = await sync_to_async(services.open_room_for_customer)(
            customer=customer, shop=shop
        )

        layer = get_channel_layer()
        room_listener = await layer.new_channel()
        user_listener = await layer.new_channel()
        await layer.group_add(f"chat.room.{room.id}", room_listener)
        await layer.group_add(f"user.{owner.id}", user_listener)

        application = ChatRoomConsumer.as_asgi()
        communicator = WebsocketCommunicator(
            application, f"/ws/chat/rooms/{room.id}/"
        )
        communicator.scope["user"] = customer
        communicator.scope["url_route"] = {"kwargs": {"room_id": str(room.id)}}

        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        await communicator.send_json_to({"type": "typing", "is_typing": True})

        room_event = await layer.receive(room_listener)
        self.assertEqual(room_event["type"], "chat.event")
        self.assertEqual(room_event["data"]["type"], "chat.typing")
        self.assertEqual(room_event["data"]["user_id"], customer.id)
        self.assertTrue(room_event["data"]["is_typing"])
        self.assertEqual(room_event["data"]["room_id"], room.id)

        user_event = await layer.receive(user_listener)
        self.assertEqual(user_event["type"], "notify")
        self.assertEqual(user_event["data"]["kind"], "chat.typing")
        self.assertEqual(user_event["data"]["payload"]["user_id"], customer.id)
        self.assertTrue(user_event["data"]["payload"]["is_typing"])
        self.assertEqual(user_event["data"]["payload"]["room_id"], room.id)

        await communicator.disconnect()
