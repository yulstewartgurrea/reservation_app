"""Per-service sequential quantity feature.

Sequential model: quantity multiplies duration & price linearly, one staff,
one contiguous block, buffer added ONCE. Per-service opt-in via
`Service.max_quantity` (default 1 = not offered). Everything defaults to 1 so
existing bookings are unaffected.
"""

from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.test_factories import (
    future_dt,
    make_customer,
    make_service,
    make_shop,
    make_shop_owner,
)
from apps.reservations.services import create_customer_reservation, reschedule


class QuantityModelDefaultsTests(TestCase):
    """Backward compatibility: new fields default to 1 / 'unit'."""

    def test_service_quantity_fields_default(self):
        service = make_service()
        self.assertEqual(service.max_quantity, 1)
        self.assertEqual(service.unit_label, "unit")

    def test_reservation_quantity_defaults_to_one(self):
        customer = make_customer()
        shop = make_shop()
        service = make_service(shop=shop, duration=60, price="500.00")
        r = create_customer_reservation(
            customer=customer, shop=shop, service=service, start_at=future_dt(48)
        )
        self.assertEqual(r.quantity, 1)
        self.assertEqual(r.total_price, Decimal("500.00"))
        self.assertEqual(r.end_at - r.start_at, timedelta(minutes=60))


class QuantityServiceLayerTests(TestCase):
    def setUp(self):
        self.customer = make_customer()
        self.shop = make_shop()
        self.service = make_service(
            shop=self.shop, duration=30, buffer_=10, price="200.00"
        )
        self.service.max_quantity = 4
        self.service.unit_label = "vehicle"
        self.service.save()

    def test_quantity_scales_duration_and_price_buffer_once(self):
        start = future_dt(48)
        r = create_customer_reservation(
            customer=self.customer,
            shop=self.shop,
            service=self.service,
            start_at=start,
            quantity=3,
        )
        self.assertEqual(r.quantity, 3)
        # 30 * 3 = 90 minutes of work; buffer (10) NOT in end_at.
        self.assertEqual(r.end_at - r.start_at, timedelta(minutes=90))
        self.assertEqual(r.total_price, Decimal("600.00"))

    def test_quantity_scales_conflict_window(self):
        start = future_dt(48)
        # quantity=2 -> 60 min of work. A booking starting 30 min in must
        # conflict (it would land inside the first booking's scaled block),
        # whereas with quantity=1 (30 min) it would have been free.
        create_customer_reservation(
            customer=self.customer,
            shop=self.shop,
            service=self.service,
            start_at=start,
            quantity=2,
        )
        with self.assertRaises(Exception):
            create_customer_reservation(
                customer=make_customer(),
                shop=self.shop,
                service=self.service,
                start_at=start + timedelta(minutes=30),
                quantity=1,
            )
        # After the full scaled block + buffer (60 + 10) the slot is free.
        ok = create_customer_reservation(
            customer=make_customer(),
            shop=self.shop,
            service=self.service,
            start_at=start + timedelta(minutes=75),
            quantity=1,
        )
        self.assertIsNotNone(ok.id)

    def test_quantity_exceeding_max_rejected(self):
        from rest_framework.exceptions import ValidationError

        with self.assertRaises(ValidationError):
            create_customer_reservation(
                customer=self.customer,
                shop=self.shop,
                service=self.service,
                start_at=future_dt(48),
                quantity=5,  # max_quantity is 4
            )

    def test_quantity_below_one_rejected(self):
        from rest_framework.exceptions import ValidationError

        with self.assertRaises(ValidationError):
            create_customer_reservation(
                customer=self.customer,
                shop=self.shop,
                service=self.service,
                start_at=future_dt(48),
                quantity=0,
            )

    def test_reschedule_preserves_quantity(self):
        r = create_customer_reservation(
            customer=self.customer,
            shop=self.shop,
            service=self.service,
            start_at=future_dt(48),
            quantity=3,
        )
        reschedule(reservation=r, new_start=future_dt(72), actor=self.customer)
        r.refresh_from_db()
        self.assertEqual(r.quantity, 3)
        self.assertEqual(r.end_at - r.start_at, timedelta(minutes=90))
        self.assertEqual(r.total_price, Decimal("600.00"))

    def test_reschedule_can_change_quantity_explicitly(self):
        r = create_customer_reservation(
            customer=self.customer,
            shop=self.shop,
            service=self.service,
            start_at=future_dt(48),
            quantity=3,
        )
        reschedule(
            reservation=r, new_start=future_dt(72), actor=self.customer, quantity=2
        )
        r.refresh_from_db()
        self.assertEqual(r.quantity, 2)
        self.assertEqual(r.total_price, Decimal("400.00"))


class QuantityApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.customer = make_customer()
        self.shop = make_shop()
        self.service = make_service(
            shop=self.shop, duration=60, price="500.00"
        )
        self.service.max_quantity = 3
        self.service.save()
        self.client.force_authenticate(self.customer)

    def test_book_with_quantity(self):
        response = self.client.post(
            "/api/reservations/book/",
            {
                "shop": self.shop.id,
                "service": self.service.id,
                "start_at": future_dt(48).isoformat(),
                "quantity": 2,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertEqual(body["quantity"], 2)
        self.assertEqual(Decimal(body["total_price"]), Decimal("1000.00"))

    def test_book_quantity_exceeding_max_returns_400(self):
        response = self.client.post(
            "/api/reservations/book/",
            {
                "shop": self.shop.id,
                "service": self.service.id,
                "start_at": future_dt(48).isoformat(),
                "quantity": 9,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("maximum", str(response.content).lower())

    def test_availability_quantity_exceeding_max_returns_400(self):
        target = (timezone.now() + timedelta(days=2)).date().isoformat()
        response = self.client.get(
            "/api/reservations/availability/",
            {
                "shop": self.shop.id,
                "service": self.service.id,
                "date": target,
                "quantity": 9,
            },
        )
        self.assertEqual(response.status_code, 400)

    def test_availability_with_quantity_scales_slot_length(self):
        target = (timezone.now() + timedelta(days=2)).date().isoformat()
        r1 = self.client.get(
            "/api/reservations/availability/",
            {"shop": self.shop.id, "service": self.service.id, "date": target},
        ).json()
        r2 = self.client.get(
            "/api/reservations/availability/",
            {
                "shop": self.shop.id,
                "service": self.service.id,
                "date": target,
                "quantity": 2,
            },
        ).json()
        # quantity=2 doubles each slot's duration, so fewer slots fit the day.
        self.assertGreater(len(r1), 0)
        self.assertGreater(len(r1), len(r2))


class WalkInQuantityTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = make_shop_owner()
        self.shop = make_shop(owner=self.owner)
        self.service = make_service(
            shop=self.shop, duration=60, price="500.00"
        )
        self.service.max_quantity = 3
        self.service.save()
        self.client.force_authenticate(self.owner)

    def test_walk_in_with_quantity(self):
        response = self.client.post(
            "/api/reservations/walk-in/",
            {
                "shop": self.shop.id,
                "service": self.service.id,
                "start_at": future_dt(48).isoformat(),
                "guest_name": "Jane",
                "quantity": 3,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertEqual(body["quantity"], 3)
        self.assertEqual(Decimal(body["total_price"]), Decimal("1500.00"))
