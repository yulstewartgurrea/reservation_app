"""Unit tests for chat service-layer logic."""

from django.test import TestCase

from apps.chat import services
from apps.chat.models import ChatRoom, Message
from apps.core.test_factories import make_customer, make_shop, make_shop_owner
from apps.notifications.models import Notification
from apps.shops.models import Shop


class OpenRoomTests(TestCase):
    def test_customer_can_open_room_with_active_shop(self):
        customer = make_customer()
        shop = make_shop()
        room = services.open_room_for_customer(customer=customer, shop=shop)
        self.assertEqual(room.customer, customer)
        self.assertEqual(room.shop, shop)
        # Participants seeded for both sides
        self.assertEqual(room.participants.count(), 2)

    def test_open_room_is_idempotent(self):
        customer = make_customer()
        shop = make_shop()
        a = services.open_room_for_customer(customer=customer, shop=shop)
        b = services.open_room_for_customer(customer=customer, shop=shop)
        self.assertEqual(a.id, b.id)

    def test_cannot_open_room_with_inactive_shop(self):
        customer = make_customer()
        shop = make_shop(status=Shop.Status.PENDING)
        with self.assertRaises(PermissionError):
            services.open_room_for_customer(customer=customer, shop=shop)


class SendAndEditTests(TestCase):
    def setUp(self):
        self.customer = make_customer()
        self.shop = make_shop()
        self.owner = self.shop.owner
        self.room = services.open_room_for_customer(customer=self.customer, shop=self.shop)

    def test_customer_can_send_message(self):
        msg = services.send_message(room=self.room, sender=self.customer, body="hi")
        self.assertEqual(msg.body, "hi")
        self.room.refresh_from_db()
        self.assertIsNotNone(self.room.last_message_at)

    def test_owner_can_reply(self):
        msg = services.send_message(room=self.room, sender=self.owner, body="hello")
        self.assertEqual(msg.sender, self.owner)

    def test_outsider_cannot_send_message(self):
        outsider = make_customer()
        with self.assertRaises(PermissionError):
            services.send_message(room=self.room, sender=outsider, body="sneaky")

    def test_empty_body_rejected(self):
        with self.assertRaises(ValueError):
            services.send_message(room=self.room, sender=self.customer, body="   ")

    def test_sender_can_edit_their_own_message(self):
        msg = services.send_message(room=self.room, sender=self.customer, body="typo")
        edited = services.edit_message(message=msg, user=self.customer, body="fixed")
        self.assertEqual(edited.body, "fixed")
        self.assertIsNotNone(edited.edited_at)

    def test_other_user_cannot_edit_message(self):
        msg = services.send_message(room=self.room, sender=self.customer, body="mine")
        with self.assertRaises(PermissionError):
            services.edit_message(message=msg, user=self.owner, body="hack")


class UnreadTests(TestCase):
    def setUp(self):
        self.customer = make_customer()
        self.shop = make_shop()
        self.owner = self.shop.owner
        self.room = services.open_room_for_customer(customer=self.customer, shop=self.shop)

    def test_messages_from_self_do_not_count_as_unread(self):
        services.send_message(room=self.room, sender=self.customer, body="hi1")
        services.send_message(room=self.room, sender=self.customer, body="hi2")
        self.assertEqual(
            services.unread_count_for_room(room=self.room, user=self.customer), 0
        )

    def test_messages_from_other_party_count_as_unread(self):
        services.send_message(room=self.room, sender=self.owner, body="hello1")
        services.send_message(room=self.room, sender=self.owner, body="hello2")
        self.assertEqual(
            services.unread_count_for_room(room=self.room, user=self.customer), 2
        )

    def test_mark_read_up_to_clears_older_unread(self):
        m1 = services.send_message(room=self.room, sender=self.owner, body="a")
        m2 = services.send_message(room=self.room, sender=self.owner, body="b")
        services.mark_read_up_to(room=self.room, user=self.customer, message_id=m2.id)
        self.assertEqual(
            services.unread_count_for_room(room=self.room, user=self.customer), 0
        )

    def test_mark_unread_from_brings_message_back_into_unread(self):
        m1 = services.send_message(room=self.room, sender=self.owner, body="a")
        m2 = services.send_message(room=self.room, sender=self.owner, body="b")
        services.mark_read_up_to(room=self.room, user=self.customer, message_id=m2.id)
        # Now rewind to m2 — both m2 and any newer become unread
        services.mark_unread_from(room=self.room, user=self.customer, message_id=m2.id)
        self.assertEqual(
            services.unread_count_for_room(room=self.room, user=self.customer), 1
        )

    def test_mark_unread_from_first_message_resets_cursor_to_null(self):
        m1 = services.send_message(room=self.room, sender=self.owner, body="a")
        services.mark_read_up_to(room=self.room, user=self.customer, message_id=m1.id)
        services.mark_unread_from(room=self.room, user=self.customer, message_id=m1.id)
        p = services.get_participant(room=self.room, user=self.customer)
        self.assertIsNone(p.last_read_message_id)
        self.assertEqual(
            services.unread_count_for_room(room=self.room, user=self.customer), 1
        )

    def test_chat_notification_persists_for_recipient(self):
        services.send_message(room=self.room, sender=self.owner, body="hello")
        notifs = Notification.objects.filter(
            user=self.customer, kind=Notification.Kind.CHAT_NEW_MESSAGE
        )
        self.assertEqual(notifs.count(), 1)
        n = notifs.first()
        self.assertEqual(n.body, "hello")
        self.assertEqual(n.payload.get("room_id"), self.room.id)

    def test_chat_notification_collapses_per_room_when_unread(self):
        services.send_message(room=self.room, sender=self.owner, body="first")
        services.send_message(room=self.room, sender=self.owner, body="second")
        notifs = Notification.objects.filter(
            user=self.customer, kind=Notification.Kind.CHAT_NEW_MESSAGE
        )
        # Two messages from same room collapse to one unread row.
        self.assertEqual(notifs.count(), 1)
        self.assertEqual(notifs.first().body, "second")

    def test_chat_notification_inserts_new_row_after_previous_was_read(self):
        services.send_message(room=self.room, sender=self.owner, body="first")
        # Recipient acknowledges existing notification.
        Notification.objects.filter(user=self.customer).update(read_at="2026-01-01T00:00:00Z")
        services.send_message(room=self.room, sender=self.owner, body="second")
        notifs = Notification.objects.filter(
            user=self.customer, kind=Notification.Kind.CHAT_NEW_MESSAGE
        )
        # The read row stays as history; a new unread row is created.
        self.assertEqual(notifs.count(), 2)
        self.assertEqual(notifs.filter(read_at__isnull=True).count(), 1)

    def test_chat_notification_not_created_for_sender(self):
        services.send_message(room=self.room, sender=self.owner, body="hi")
        owner_notifs = Notification.objects.filter(
            user=self.owner, kind=Notification.Kind.CHAT_NEW_MESSAGE
        )
        self.assertEqual(owner_notifs.count(), 0)

    def test_total_unread_aggregates_across_rooms(self):
        # Second room, second shop
        shop2 = make_shop(owner=make_shop_owner())
        room2 = services.open_room_for_customer(customer=self.customer, shop=shop2)
        services.send_message(room=self.room, sender=self.owner, body="r1")
        services.send_message(room=room2, sender=shop2.owner, body="r2a")
        services.send_message(room=room2, sender=shop2.owner, body="r2b")
        self.assertEqual(services.total_unread_for_user(user=self.customer), 3)
