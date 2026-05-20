"""Tests for the payments app: dev-mode checkout, webhook signature, mark-paid side effects."""

import hashlib
import hmac
import json
from datetime import time, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.payments.models import Payment
from apps.payments.services import mark_paid, start_checkout
from apps.reservations.models import Reservation
from apps.reservations.services import create_customer_reservation
from apps.services.models import Service
from apps.shops.models import Shop, WeekdayHours

User = get_user_model()


def _make_world():
    owner = User.objects.create_user(
        username="owner", email="o@example.com", password="x", role=User.Role.SHOP_OWNER
    )
    customer = User.objects.create_user(
        username="cust", email="c@example.com", password="x", role=User.Role.CUSTOMER
    )
    shop = Shop.objects.create(
        owner=owner,
        name="Shop",
        address_line="1 Main",
        city="Cebu",
        country="PH",
        status=Shop.Status.ACTIVE,
    )
    for wd in range(7):
        WeekdayHours.objects.create(
            shop=shop, weekday=wd, is_closed=False, open_time=time(8, 0), close_time=time(20, 0)
        )
    from apps.shops.models import Resource

    Resource.objects.create(shop=shop, name="Station 1")
    service = Service.objects.create(
        shop=shop, name="Cut", duration_minutes=60, price=Decimal("500.00")
    )
    reservation = create_customer_reservation(
        customer=customer,
        shop=shop,
        service=service,
        staff=None,
        start_at=timezone.now() + timedelta(hours=48),
        payment_method=Reservation.PaymentMethod.ONLINE,
    )
    return owner, customer, shop, service, reservation


@override_settings(PAYMONGO_SECRET_KEY="")  # force dev-mode fake checkout
class StartCheckoutDevModeTests(TestCase):
    def test_start_checkout_returns_dev_fake_url_when_unconfigured(self):
        _, _, _, _, reservation = _make_world()
        payment = start_checkout(
            reservation=reservation,
            success_url="http://x/success",
            cancel_url="http://x/cancel",
        )
        self.assertEqual(payment.status, Payment.Status.PENDING)
        self.assertTrue(payment.provider_session_id.startswith("dev_fake_"))
        self.assertIn("dev=1", payment.checkout_url)
        self.assertEqual(payment.amount, reservation.total_price)

    def test_start_checkout_is_idempotent(self):
        _, _, _, _, reservation = _make_world()
        a = start_checkout(
            reservation=reservation,
            success_url="http://x/success",
            cancel_url="http://x/cancel",
        )
        b = start_checkout(
            reservation=reservation,
            success_url="http://x/success",
            cancel_url="http://x/cancel",
        )
        self.assertEqual(a.id, b.id)

    def test_mark_paid_auto_confirms_pending_reservation(self):
        _, _, _, _, reservation = _make_world()
        payment = start_checkout(
            reservation=reservation,
            success_url="http://x/s",
            cancel_url="http://x/c",
        )
        self.assertEqual(reservation.status, Reservation.Status.PENDING)
        mark_paid(payment=payment)
        reservation.refresh_from_db()
        self.assertEqual(reservation.status, Reservation.Status.CONFIRMED)
        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.PAID)
        self.assertIsNotNone(payment.paid_at)


@override_settings(PAYMONGO_WEBHOOK_SECRET="testsecret")
class WebhookSignatureTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        _, _, _, _, self.reservation = _make_world()
        self.payment = start_checkout(
            reservation=self.reservation,
            success_url="http://x/s",
            cancel_url="http://x/c",
        )

    def _signed_request(self, body: dict, secret: str = "testsecret"):
        ts = "1700000000"
        payload = json.dumps(body)
        sig = hmac.new(
            secret.encode(), f"{ts}.{payload}".encode(), hashlib.sha256
        ).hexdigest()
        return self.client.post(
            "/api/payments/webhooks/paymongo/",
            data=payload,
            content_type="application/json",
            HTTP_PAYMONGO_SIGNATURE=f"t={ts},te={sig}",
        )

    def test_valid_signature_marks_paid(self):
        body = {
            "data": {
                "attributes": {
                    "type": "checkout_session.payment.paid",
                    "data": {"id": self.payment.provider_session_id, "attributes": {}},
                }
            }
        }
        response = self._signed_request(body)
        self.assertEqual(response.status_code, 200)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, Payment.Status.PAID)

    def test_bad_signature_rejected(self):
        body = {
            "data": {
                "attributes": {
                    "type": "checkout_session.payment.paid",
                    "data": {"id": self.payment.provider_session_id, "attributes": {}},
                }
            }
        }
        response = self._signed_request(body, secret="wrong")
        self.assertEqual(response.status_code, 400)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, Payment.Status.PENDING)


class CheckoutEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        _, self.customer, _, _, self.reservation = _make_world()
        self.client.force_authenticate(self.customer)

    @override_settings(PAYMONGO_SECRET_KEY="")
    def test_checkout_endpoint_requires_owner_of_reservation(self):
        outsider = User.objects.create_user(
            username="other", email="z@example.com", password="x", role=User.Role.CUSTOMER
        )
        self.client.force_authenticate(outsider)
        response = self.client.post(
            f"/api/payments/reservations/{self.reservation.id}/checkout/"
        )
        self.assertEqual(response.status_code, 403)

    @override_settings(PAYMONGO_SECRET_KEY="")
    def test_checkout_endpoint_returns_url(self):
        response = self.client.post(
            f"/api/payments/reservations/{self.reservation.id}/checkout/"
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("checkout_url", response.json())
        self.assertTrue(response.json()["checkout_url"])

    @override_settings(PAYMONGO_SECRET_KEY="")
    def test_dev_confirm_completes_payment(self):
        # bring it into existence first
        self.client.post(f"/api/payments/reservations/{self.reservation.id}/checkout/")
        response = self.client.post(
            f"/api/payments/reservations/{self.reservation.id}/dev-confirm/"
        )
        self.assertEqual(response.status_code, 200)
        self.reservation.refresh_from_db()
        self.assertEqual(self.reservation.status, Reservation.Status.CONFIRMED)
