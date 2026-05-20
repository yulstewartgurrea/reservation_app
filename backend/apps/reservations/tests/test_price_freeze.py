"""Price-freeze-via-snapshot guarantees.

Each reservation snapshots `unit_price` at booking time. Later changes to
`Service.price` must never re-price an existing booking, so commission and
revenue (which read the per-reservation snapshot) stay historically correct.
"""

from decimal import Decimal

from django.test import TestCase

from apps.core.test_factories import (
    future_dt,
    make_customer,
    make_service,
    make_shop,
)
from apps.reservations.models import CommissionLedger, Reservation
from apps.reservations.services import (
    create_customer_reservation,
    reschedule,
    transition,
)


class PriceFreezeTests(TestCase):
    def setUp(self):
        self.shop = make_shop(commission_rate=Decimal("0.1000"))
        self.service = make_service(
            shop=self.shop, duration=60, price="500.00"
        )

    def test_existing_booking_unaffected_by_later_price_change(self):
        first = create_customer_reservation(
            customer=make_customer(),
            shop=self.shop,
            service=self.service,
            start_at=future_dt(48),
        )
        self.assertEqual(first.unit_price, Decimal("500.00"))
        self.assertEqual(first.total_price, Decimal("500.00"))

        # Owner raises the price.
        self.service.price = Decimal("800.00")
        self.service.save(update_fields=["price"])

        first.refresh_from_db()
        self.assertEqual(first.unit_price, Decimal("500.00"))
        self.assertEqual(first.total_price, Decimal("500.00"))

        # A brand-new booking picks up the new price.
        second = create_customer_reservation(
            customer=make_customer(),
            shop=self.shop,
            service=self.service,
            start_at=future_dt(96),
        )
        self.assertEqual(second.unit_price, Decimal("800.00"))
        self.assertEqual(second.total_price, Decimal("800.00"))

    def test_reschedule_after_price_change_keeps_frozen_total(self):
        r = create_customer_reservation(
            customer=make_customer(),
            shop=self.shop,
            service=self.service,
            start_at=future_dt(48),
        )
        self.service.price = Decimal("999.00")
        self.service.save(update_fields=["price"])

        reschedule(reservation=r, new_start=future_dt(72), actor=r.customer)
        r.refresh_from_db()
        self.assertEqual(r.unit_price, Decimal("500.00"))
        self.assertEqual(r.total_price, Decimal("500.00"))

    def test_reschedule_with_quantity_change_scales_from_frozen_unit_price(self):
        self.service.max_quantity = 5
        self.service.save(update_fields=["max_quantity"])
        r = create_customer_reservation(
            customer=make_customer(),
            shop=self.shop,
            service=self.service,
            start_at=future_dt(48),
            quantity=2,
        )
        self.assertEqual(r.total_price, Decimal("1000.00"))

        # Price changes, then quantity is changed during reschedule.
        self.service.price = Decimal("999.00")
        self.service.save(update_fields=["price"])
        reschedule(
            reservation=r, new_start=future_dt(72), actor=r.customer, quantity=3
        )
        r.refresh_from_db()
        # 3 * frozen 500.00, NOT 3 * 999.00.
        self.assertEqual(r.unit_price, Decimal("500.00"))
        self.assertEqual(r.total_price, Decimal("1500.00"))

    def test_commission_uses_frozen_total_after_price_change(self):
        r = create_customer_reservation(
            customer=make_customer(),
            shop=self.shop,
            service=self.service,
            start_at=future_dt(48),
            payment_method=Reservation.PaymentMethod.ONLINE,
        )
        # Price doubles after booking but before completion.
        self.service.price = Decimal("1000.00")
        self.service.save(update_fields=["price"])

        transition(
            reservation=r,
            to_status=Reservation.Status.COMPLETED,
            actor=r.customer,
        )
        r.refresh_from_db()
        # 10% of the FROZEN 500.00, not of the new 1000.00.
        self.assertEqual(r.commission_amount, Decimal("50.00"))
        entry = CommissionLedger.objects.get(reservation=r)
        self.assertEqual(entry.amount, Decimal("50.00"))
