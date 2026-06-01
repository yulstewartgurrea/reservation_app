"""Customer receipt emails on shop-driven lifecycle steps.

When the shop owner confirms a pending appointment the customer gets a
"confirmed" receipt; when the owner marks it completed the customer gets a
"service completed" receipt. Both ride the ReservationStatusHistory signal.
"""

from django.core import mail
from django.test import TestCase

from apps.core.test_factories import (
    future_dt,
    make_customer,
    make_reservation,
    make_service,
    make_shop,
)
from apps.reservations.models import Reservation
from apps.reservations.services import create_walk_in, transition


class ReceiptEmailTests(TestCase):
    def setUp(self):
        self.shop = make_shop()
        self.service = make_service(shop=self.shop, duration=60, price="500.00")
        self.customer = make_customer(email="cust@example.com")
        self.reservation = make_reservation(
            customer=self.customer, shop=self.shop, service=self.service
        )
        mail.outbox.clear()  # drop the booking-requested email

    def _last(self):
        self.assertEqual(len(mail.outbox), 1)
        return mail.outbox[0]

    def test_confirm_sends_receipt_to_customer(self):
        transition(
            reservation=self.reservation,
            to_status=Reservation.Status.CONFIRMED,
            actor=self.shop.owner,
        )
        msg = self._last()
        self.assertEqual(msg.to, ["cust@example.com"])
        self.assertIn("Appointment confirmed", msg.subject)
        self.assertIn(self.shop.name, msg.subject)
        self.assertIn("500", msg.body)

    def test_complete_sends_receipt_to_customer(self):
        transition(
            reservation=self.reservation,
            to_status=Reservation.Status.CONFIRMED,
            actor=self.shop.owner,
        )
        mail.outbox.clear()
        transition(
            reservation=self.reservation,
            to_status=Reservation.Status.COMPLETED,
            actor=self.shop.owner,
        )
        msg = self._last()
        self.assertEqual(msg.to, ["cust@example.com"])
        self.assertIn("Service completed", msg.subject)
        self.assertIn("500", msg.body)
        # HTML alternative is the styled receipt.
        html = msg.alternatives[0][0]
        self.assertIn("Completed", html)

    def test_cancel_does_not_send_a_receipt(self):
        transition(
            reservation=self.reservation,
            to_status=Reservation.Status.CANCELLED_BY_SHOP,
            actor=self.shop.owner,
        )
        self.assertEqual(len(mail.outbox), 0)

    def test_walk_in_without_customer_does_not_crash_or_send(self):
        walk_in = create_walk_in(
            shop_owner=self.shop.owner,
            shop=self.shop,
            service=self.service,
            start_at=future_dt(2),
            guest_name="Jane",
        )
        mail.outbox.clear()
        transition(
            reservation=walk_in,
            to_status=Reservation.Status.COMPLETED,
            actor=self.shop.owner,
        )
        self.assertEqual(len(mail.outbox), 0)
