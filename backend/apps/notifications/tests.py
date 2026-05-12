"""Integration tests for the notifications REST API + signal-driven creation."""

from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.test_factories import (
    make_customer,
    make_reservation,
    make_shop_owner,
)
from apps.notifications.models import Notification


class NotificationCreationViaSignalsTests(TestCase):
    """Verify the post_save signals on Reservation create push notifications."""

    def test_new_booking_pushes_notification_to_shop_owner(self):
        # The signal fires on reservation creation
        reservation = make_reservation()
        owner = reservation.shop.owner
        notifications = Notification.objects.filter(user=owner)
        self.assertTrue(notifications.exists())
        self.assertEqual(notifications.first().kind, Notification.Kind.BOOKING_NEW)

    def test_new_booking_pushes_notification_to_customer(self):
        reservation = make_reservation()
        notifications = Notification.objects.filter(user=reservation.customer)
        self.assertTrue(notifications.exists())


class NotificationRESTAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = make_customer()
        # Seed a couple of notifications
        self.n1 = Notification.objects.create(
            user=self.user,
            kind=Notification.Kind.BOOKING_NEW,
            title="Booking 1",
        )
        self.n2 = Notification.objects.create(
            user=self.user,
            kind=Notification.Kind.BOOKING_CONFIRMED,
            title="Booking 2",
        )
        self.client.force_authenticate(self.user)

    def test_list_returns_only_own_notifications(self):
        # Other user's notification should not appear
        Notification.objects.create(
            user=make_customer(), kind="booking_new", title="not mine"
        )
        response = self.client.get("/api/notifications/")
        self.assertEqual(response.status_code, 200)
        data = response.json().get("results") or response.json()
        ids = {row["id"] for row in data}
        self.assertEqual(ids, {self.n1.id, self.n2.id})

    def test_mark_one_read(self):
        response = self.client.post(f"/api/notifications/{self.n1.id}/mark-read/")
        self.assertEqual(response.status_code, 200)
        self.n1.refresh_from_db()
        self.assertIsNotNone(self.n1.read_at)
        # Other notification still unread
        self.n2.refresh_from_db()
        self.assertIsNone(self.n2.read_at)

    def test_mark_all_read(self):
        response = self.client.post("/api/notifications/mark-all-read/")
        self.assertEqual(response.status_code, 200)
        self.n1.refresh_from_db()
        self.n2.refresh_from_db()
        self.assertIsNotNone(self.n1.read_at)
        self.assertIsNotNone(self.n2.read_at)

    def test_unauthenticated_cannot_list(self):
        self.client.force_authenticate(None)
        response = self.client.get("/api/notifications/")
        self.assertEqual(response.status_code, 401)
