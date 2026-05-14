"""Integration tests for the notifications REST API + signal-driven creation,
plus maintenance-reminder CRUD and dispatching."""

from datetime import timedelta

from django.core import mail
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.test_factories import (
    make_customer,
    make_reservation,
    make_service,
    make_shop,
    make_shop_owner,
)
from apps.notifications.models import MaintenanceReminder, Notification
from apps.notifications.services import dispatch_due_maintenance_reminders


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


class MaintenanceReminderCRUDTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = make_shop_owner()
        self.shop = make_shop(owner=self.owner)
        self.service = make_service(shop=self.shop)
        self.customer = make_customer()
        self.client.force_authenticate(self.owner)

    def _payload(self, **overrides):
        base = {
            "shop": self.shop.id,
            "customer_email": self.customer.email,
            "service": self.service.id,
            "title": "Aircon cleaning",
            "message": "Time to clean the unit.",
            "interval_months": 6,
            "next_due_at": (timezone.now() + timedelta(days=180)).isoformat(),
            "is_active": True,
        }
        base.update(overrides)
        return base

    def test_owner_can_create_reminder(self):
        response = self.client.post(
            "/api/notifications/maintenance-reminders/", self._payload(), format="json"
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(MaintenanceReminder.objects.count(), 1)
        reminder = MaintenanceReminder.objects.first()
        self.assertEqual(reminder.customer, self.customer)
        self.assertEqual(reminder.created_by, self.owner)

    def test_create_rejects_unknown_customer_email(self):
        response = self.client.post(
            "/api/notifications/maintenance-reminders/",
            self._payload(customer_email="ghost@example.com"),
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("customer_email", response.json())

    def test_owner_cannot_create_for_other_shop(self):
        other_owner = make_shop_owner()
        other_shop = make_shop(owner=other_owner)
        response = self.client.post(
            "/api/notifications/maintenance-reminders/",
            self._payload(shop=other_shop.id),
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_customer_cannot_use_endpoint(self):
        self.client.force_authenticate(self.customer)
        response = self.client.get("/api/notifications/maintenance-reminders/")
        self.assertEqual(response.status_code, 403)

    def test_list_only_returns_own_shop_reminders(self):
        MaintenanceReminder.objects.create(
            shop=self.shop,
            customer=self.customer,
            title="Mine",
            interval_months=6,
            next_due_at=timezone.now() + timedelta(days=180),
        )
        # Another shop owner's reminder shouldn't appear
        other_owner = make_shop_owner()
        other_shop = make_shop(owner=other_owner)
        MaintenanceReminder.objects.create(
            shop=other_shop,
            customer=self.customer,
            title="Theirs",
            interval_months=6,
            next_due_at=timezone.now() + timedelta(days=180),
        )
        response = self.client.get("/api/notifications/maintenance-reminders/")
        self.assertEqual(response.status_code, 200)
        results = response.json().get("results") or response.json()
        titles = {row["title"] for row in results}
        self.assertEqual(titles, {"Mine"})


class MaintenanceReminderDispatchTests(TestCase):
    def setUp(self):
        self.owner = make_shop_owner()
        self.shop = make_shop(owner=self.owner)
        self.customer = make_customer()

    def _reminder(self, *, due_in_days: int, **overrides):
        defaults = dict(
            shop=self.shop,
            customer=self.customer,
            title="Aircon cleaning",
            interval_months=6,
            next_due_at=timezone.now() + timedelta(days=due_in_days),
            is_active=True,
        )
        defaults.update(overrides)
        return MaintenanceReminder.objects.create(**defaults)

    def test_dispatches_only_due_reminders(self):
        due = self._reminder(due_in_days=-1)
        not_due = self._reminder(due_in_days=10)
        mail.outbox.clear()
        result = dispatch_due_maintenance_reminders()
        self.assertEqual(result["sent"], 1)
        self.assertEqual(len(mail.outbox), 1)
        due.refresh_from_db()
        not_due.refresh_from_db()
        self.assertIsNotNone(due.last_sent_at)
        self.assertIsNone(not_due.last_sent_at)

    def test_rolls_forward_next_due_after_send(self):
        reminder = self._reminder(due_in_days=-1, interval_months=6)
        original_due = reminder.next_due_at
        dispatch_due_maintenance_reminders()
        reminder.refresh_from_db()
        # Should now be ~6 months out
        self.assertGreater(reminder.next_due_at, original_due)
        self.assertGreater(reminder.next_due_at, timezone.now() + timedelta(days=150))

    def test_inactive_reminders_skipped(self):
        self._reminder(due_in_days=-1, is_active=False)
        mail.outbox.clear()
        result = dispatch_due_maintenance_reminders()
        self.assertEqual(result["sent"], 0)
        self.assertEqual(len(mail.outbox), 0)

    def test_creates_in_app_notification(self):
        self._reminder(due_in_days=-1)
        before = Notification.objects.filter(user=self.customer).count()
        dispatch_due_maintenance_reminders()
        after = Notification.objects.filter(user=self.customer, kind=Notification.Kind.REMINDER).count()
        self.assertEqual(after - before, 1)
