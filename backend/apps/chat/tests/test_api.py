"""REST integration tests for chat endpoints."""

from django.test import TestCase
from rest_framework.test import APIClient

from apps.chat import services
from apps.chat.models import Message
from apps.core.test_factories import make_customer, make_shop


class ChatRoomAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.customer = make_customer()
        self.shop = make_shop()
        self.owner = self.shop.owner

    def _auth(self, user):
        self.client.force_authenticate(user)

    def test_customer_opens_room(self):
        self._auth(self.customer)
        res = self.client.post("/api/chat/rooms/", {"shop": self.shop.id}, format="json")
        self.assertEqual(res.status_code, 201)
        body = res.json()
        self.assertEqual(body["shop"], self.shop.id)
        self.assertEqual(body["customer"], self.customer.id)

    def test_shop_owner_cannot_create_room(self):
        self._auth(self.owner)
        res = self.client.post("/api/chat/rooms/", {"shop": self.shop.id}, format="json")
        self.assertEqual(res.status_code, 403)

    def test_list_returns_only_my_rooms(self):
        my_room = services.open_room_for_customer(customer=self.customer, shop=self.shop)
        other_room = services.open_room_for_customer(customer=make_customer(), shop=self.shop)
        self._auth(self.customer)
        res = self.client.get("/api/chat/rooms/")
        self.assertEqual(res.status_code, 200)
        ids = {r["id"] for r in (res.json().get("results") or res.json())}
        self.assertIn(my_room.id, ids)
        self.assertNotIn(other_room.id, ids)

    def test_send_message_then_list(self):
        room = services.open_room_for_customer(customer=self.customer, shop=self.shop)
        self._auth(self.customer)
        send = self.client.post(
            f"/api/chat/rooms/{room.id}/messages/", {"body": "hello"}, format="json"
        )
        self.assertEqual(send.status_code, 201)
        listed = self.client.get(f"/api/chat/rooms/{room.id}/messages/")
        self.assertEqual(listed.status_code, 200)
        payload = listed.json()
        rows = payload.get("results") if isinstance(payload, dict) else payload
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["body"], "hello")

    def test_outsider_cannot_view_room(self):
        room = services.open_room_for_customer(customer=self.customer, shop=self.shop)
        self._auth(make_customer())
        res = self.client.get(f"/api/chat/rooms/{room.id}/messages/")
        self.assertEqual(res.status_code, 404)

    def test_edit_message_via_patch(self):
        room = services.open_room_for_customer(customer=self.customer, shop=self.shop)
        msg = services.send_message(room=room, sender=self.customer, body="typo")
        self._auth(self.customer)
        res = self.client.patch(
            f"/api/chat/messages/{msg.id}/", {"body": "fixed"}, format="json"
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["body"], "fixed")
        self.assertIsNotNone(res.json()["edited_at"])

    def test_cannot_edit_someone_elses_message(self):
        room = services.open_room_for_customer(customer=self.customer, shop=self.shop)
        msg = services.send_message(room=room, sender=self.owner, body="from owner")
        self._auth(self.customer)
        res = self.client.patch(
            f"/api/chat/messages/{msg.id}/", {"body": "hijacked"}, format="json"
        )
        self.assertEqual(res.status_code, 403)

    def test_mark_read_and_unread(self):
        room = services.open_room_for_customer(customer=self.customer, shop=self.shop)
        m1 = services.send_message(room=room, sender=self.owner, body="a")
        m2 = services.send_message(room=room, sender=self.owner, body="b")
        self._auth(self.customer)

        read_res = self.client.post(
            f"/api/chat/rooms/{room.id}/read/", {"message_id": m2.id}, format="json"
        )
        self.assertEqual(read_res.status_code, 200)
        self.assertEqual(read_res.json()["last_read_message_id"], m2.id)

        unread_res = self.client.post(
            f"/api/chat/rooms/{room.id}/unread/", {"message_id": m2.id}, format="json"
        )
        self.assertEqual(unread_res.status_code, 200)
        # After mark-unread on m2, the cursor rewound to m1
        self.assertEqual(unread_res.json()["last_read_message_id"], m1.id)

    def test_unread_count_endpoint(self):
        room = services.open_room_for_customer(customer=self.customer, shop=self.shop)
        services.send_message(room=room, sender=self.owner, body="x")
        services.send_message(room=room, sender=self.owner, body="y")
        self._auth(self.customer)
        res = self.client.get("/api/chat/unread-count/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"unread": 2})

    def test_unauthenticated_blocked(self):
        res = self.client.get("/api/chat/rooms/")
        self.assertEqual(res.status_code, 401)
