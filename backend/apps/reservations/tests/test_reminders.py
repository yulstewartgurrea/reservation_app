"""Tests for the periodic appointment-reminder scanner.

Covers: 24h / 1h reminders to BOTH customer and shop owner, the fire
window (not too early, not stale), idempotency, and status/walk-in
exclusions. See README "reminders" notes.
"""

from datetime import timedelta

from django.core import mail
from django.test import TestCase
from django.utils import timezone

from apps.core.test_factories import (
    make_customer,
    make_reservation,
    make_service,
    make_shop,
)
from apps.reservations.models import Reservation, ReservationReminder
from apps.reservations.services import create_walk_in, transition
from apps.reservations.tasks import dispatch_due_reminders, send_reminder


class ReminderScannerTests(TestCase):
    def setUp(self):
        self.shop = make_shop()
        self.owner = self.shop.owner
        self.service = make_service(shop=self.shop, duration=60)
        self.customer = make_customer(email="cust@example.com")

    def _book(self, start_at):
        r = make_reservation(
            customer=self.customer,
            shop=self.shop,
            service=self.service,
            start_at=start_at,
        )
        mail.outbox.clear()  # drop the booking-confirmation email
        return r

    def _recipients(self):
        return sorted(addr for m in mail.outbox for addr in m.to)

    # --- fire window -----------------------------------------------------

    def test_24h_reminder_sent_to_customer_and_owner(self):
        self._book(timezone.now() + timedelta(hours=24) - timedelta(minutes=5))
        dispatch_due_reminders()
        self.assertTrue(
            ReservationReminder.objects.filter(
                offset=ReservationReminder.Offset.DAY
            ).exists()
        )
        self.assertFalse(
            ReservationReminder.objects.filter(
                offset=ReservationReminder.Offset.HOUR
            ).exists()
        )
        self.assertEqual(
            self._recipients(), ["cust@example.com", self.owner.email]
        )

    def test_1h_reminder_sent_to_customer_and_owner(self):
        self._book(timezone.now() + timedelta(hours=1) - timedelta(minutes=5))
        dispatch_due_reminders()
        self.assertTrue(
            ReservationReminder.objects.filter(
                offset=ReservationReminder.Offset.HOUR
            ).exists()
        )
        self.assertEqual(
            self._recipients(), ["cust@example.com", self.owner.email]
        )

    def test_not_dispatched_when_far_in_the_future(self):
        self._book(timezone.now() + timedelta(days=3))
        dispatch_due_reminders()
        self.assertEqual(ReservationReminder.objects.count(), 0)
        self.assertEqual(len(mail.outbox), 0)

    def test_no_stale_24h_reminder_for_short_horizon_booking(self):
        # Booked only 5h out: the 24h fire time is long past (well beyond the
        # grace window) so no "24h" reminder; the 1h one isn't due yet either.
        self._book(timezone.now() + timedelta(hours=5))
        dispatch_due_reminders()
        self.assertEqual(ReservationReminder.objects.count(), 0)
        self.assertEqual(len(mail.outbox), 0)

    # --- idempotency -----------------------------------------------------

    def test_scanner_is_idempotent(self):
        self._book(timezone.now() + timedelta(hours=1) - timedelta(minutes=5))
        dispatch_due_reminders()
        dispatch_due_reminders()
        dispatch_due_reminders()
        self.assertEqual(
            ReservationReminder.objects.filter(
                offset=ReservationReminder.Offset.HOUR
            ).count(),
            1,
        )
        self.assertEqual(len(mail.outbox), 2)  # one customer + one owner

    def test_send_reminder_is_idempotent(self):
        r = self._book(timezone.now() + timedelta(hours=1))
        send_reminder(r.id, ReservationReminder.Offset.HOUR)
        result = send_reminder(r.id, ReservationReminder.Offset.HOUR)
        self.assertIn("already sent", result)
        self.assertEqual(len(mail.outbox), 2)

    # --- exclusions ------------------------------------------------------

    def test_cancelled_reservation_is_skipped(self):
        r = self._book(timezone.now() + timedelta(hours=1) - timedelta(minutes=5))
        transition(
            reservation=r,
            to_status=Reservation.Status.CANCELLED_BY_CUSTOMER,
            actor=self.customer,
        )
        mail.outbox.clear()
        dispatch_due_reminders()
        self.assertEqual(ReservationReminder.objects.count(), 0)
        self.assertEqual(len(mail.outbox), 0)

    def test_send_reminder_skips_non_remindable_status(self):
        r = self._book(timezone.now() + timedelta(hours=1))
        transition(
            reservation=r,
            to_status=Reservation.Status.CANCELLED_BY_CUSTOMER,
            actor=self.customer,
        )
        mail.outbox.clear()
        result = send_reminder(r.id, ReservationReminder.Offset.HOUR)
        self.assertIn("skipping", result)
        self.assertEqual(ReservationReminder.objects.count(), 0)
        self.assertEqual(len(mail.outbox), 0)

    def test_walk_in_without_customer_is_excluded(self):
        create_walk_in(
            shop_owner=self.owner,
            shop=self.shop,
            service=self.service,
            start_at=timezone.now() + timedelta(hours=1) - timedelta(minutes=5),
            guest_name="Walk-In Wendy",
        )
        mail.outbox.clear()
        dispatch_due_reminders()
        self.assertEqual(ReservationReminder.objects.count(), 0)
        self.assertEqual(len(mail.outbox), 0)

    def test_owner_still_reminded_when_customer_has_no_email(self):
        self.customer.email = ""
        self.customer.save(update_fields=["email"])
        self._book(timezone.now() + timedelta(hours=1) - timedelta(minutes=5))
        dispatch_due_reminders()
        self.assertEqual(self._recipients(), [self.owner.email])
        self.assertTrue(
            ReservationReminder.objects.filter(
                offset=ReservationReminder.Offset.HOUR
            ).exists()
        )
