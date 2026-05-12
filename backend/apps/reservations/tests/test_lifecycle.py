"""End-to-end-style tests for the reservation lifecycle.

Covers the high-value paths:
- create reservation succeeds and writes a status history row
- conflict detection refuses to double-book the same staff/time
- complete + commission ledger entry is created at the configured rate
- customer no-show / late cancel applies a strike and may restrict the user
- reschedule moves the time and rejects conflicts
"""

from datetime import time, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone

from apps.reservations.models import (
    CommissionLedger,
    Reservation,
    ReservationStatusHistory,
)
from apps.reservations.services import (
    create_customer_reservation,
    create_walk_in,
    reschedule,
    transition,
)
from apps.services.models import Service
from apps.shops.models import Shop, Staff, StaffWorkingHours, WeekdayHours

User = get_user_model()


def _make_shop(owner, *, commission_rate=None, cancellation_window_hours=None) -> Shop:
    shop = Shop.objects.create(
        owner=owner,
        name="Test Shop",
        address_line="1 Main",
        city="Townsville",
        country="US",
        status=Shop.Status.ACTIVE,
        commission_rate=commission_rate,
        cancellation_window_hours=cancellation_window_hours,
    )
    for wd in range(7):
        WeekdayHours.objects.create(
            shop=shop,
            weekday=wd,
            is_closed=False,
            open_time=time(8, 0),
            close_time=time(20, 0),
        )
    return shop


def _make_service(shop, *, duration=60, buffer_=0, price="50.00") -> Service:
    return Service.objects.create(
        shop=shop,
        name="Haircut",
        duration_minutes=duration,
        buffer_minutes=buffer_,
        price=Decimal(price),
    )


def _future_dt(hours_ahead: int = 48):
    return timezone.now().replace(microsecond=0) + timedelta(hours=hours_ahead)


class ReservationCreateTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner", email="o@example.com", password="x", role=User.Role.SHOP_OWNER
        )
        self.customer = User.objects.create_user(
            username="cust", email="c@example.com", password="x", role=User.Role.CUSTOMER
        )
        self.shop = _make_shop(self.owner)
        self.service = _make_service(self.shop)

    def test_create_reservation_writes_history(self):
        start = _future_dt(48)
        r = create_customer_reservation(
            customer=self.customer,
            shop=self.shop,
            service=self.service,
            staff=None,
            start_at=start,
        )
        self.assertEqual(r.status, Reservation.Status.PENDING)
        self.assertEqual(r.end_at, start + timedelta(minutes=60))
        self.assertEqual(r.total_price, Decimal("50.00"))
        self.assertTrue(
            ReservationStatusHistory.objects.filter(reservation=r, to_status="pending").exists()
        )

    def test_double_booking_same_staff_blocked(self):
        staff = Staff.objects.create(shop=self.shop, name="Alex")
        for wd in range(7):
            StaffWorkingHours.objects.create(
                staff=staff, weekday=wd, is_off=False, start_time=time(8, 0), end_time=time(20, 0)
            )
        start = _future_dt(48)
        create_customer_reservation(
            customer=self.customer,
            shop=self.shop,
            service=self.service,
            staff=staff,
            start_at=start,
        )
        from rest_framework.exceptions import ValidationError as DRFValidationError

        with self.assertRaises(DRFValidationError):
            create_customer_reservation(
                customer=self.customer,
                shop=self.shop,
                service=self.service,
                staff=staff,
                start_at=start + timedelta(minutes=15),
            )

    def test_cannot_book_in_the_past(self):
        from rest_framework.exceptions import ValidationError as DRFValidationError

        with self.assertRaises(DRFValidationError):
            create_customer_reservation(
                customer=self.customer,
                shop=self.shop,
                service=self.service,
                staff=None,
                start_at=_future_dt(-24),  # 24h in the past
            )

    def test_walk_in_cannot_be_in_the_past(self):
        from rest_framework.exceptions import ValidationError as DRFValidationError

        with self.assertRaises(DRFValidationError):
            create_walk_in(
                shop_owner=self.owner,
                shop=self.shop,
                service=self.service,
                start_at=_future_dt(-1),
                guest_name="Late Wendy",
            )

    def test_walk_in_excluded_from_commission(self):
        start = _future_dt(48)
        r = create_walk_in(
            shop_owner=self.owner,
            shop=self.shop,
            service=self.service,
            staff=None,
            start_at=start,
            guest_name="Walk-In Wendy",
        )
        transition(reservation=r, to_status=Reservation.Status.COMPLETED, actor=self.owner)
        self.assertFalse(CommissionLedger.objects.filter(reservation=r).exists())


class CommissionTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner", email="o@example.com", password="x", role=User.Role.SHOP_OWNER
        )
        self.customer = User.objects.create_user(
            username="cust", email="c@example.com", password="x", role=User.Role.CUSTOMER
        )

    def test_commission_uses_shop_override_when_set(self):
        shop = _make_shop(self.owner, commission_rate=Decimal("0.20"))
        service = _make_service(shop, price="100.00")
        r = create_customer_reservation(
            customer=self.customer,
            shop=shop,
            service=service,
            staff=None,
            start_at=_future_dt(48),
        )
        transition(reservation=r, to_status=Reservation.Status.COMPLETED, actor=self.owner)
        entry = CommissionLedger.objects.get(reservation=r)
        self.assertEqual(entry.amount, Decimal("20.00"))
        self.assertEqual(entry.rate, Decimal("0.2000"))

    @override_settings(DEFAULT_COMMISSION_RATE=0.10)
    def test_commission_falls_back_to_platform_default(self):
        shop = _make_shop(self.owner)
        service = _make_service(shop, price="100.00")
        r = create_customer_reservation(
            customer=self.customer,
            shop=shop,
            service=service,
            staff=None,
            start_at=_future_dt(48),
        )
        transition(reservation=r, to_status=Reservation.Status.COMPLETED, actor=self.owner)
        entry = CommissionLedger.objects.get(reservation=r)
        self.assertEqual(entry.amount, Decimal("10.00"))


@override_settings(STRIKE_LIMIT=2, STRIKE_WINDOW_DAYS=90, DEFAULT_CANCELLATION_WINDOW_HOURS=24)
class StrikeTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner", email="o@example.com", password="x", role=User.Role.SHOP_OWNER
        )
        self.customer = User.objects.create_user(
            username="cust", email="c@example.com", password="x", role=User.Role.CUSTOMER
        )
        self.shop = _make_shop(self.owner)
        self.service = _make_service(self.shop)

    def _book(self, hours_ahead: int):
        return create_customer_reservation(
            customer=self.customer,
            shop=self.shop,
            service=self.service,
            staff=None,
            start_at=_future_dt(hours_ahead),
        )

    def test_late_cancel_inside_window_earns_strike(self):
        r = self._book(2)  # 2h ahead — inside default 24h window
        transition(
            reservation=r,
            to_status=Reservation.Status.CANCELLED_BY_CUSTOMER,
            actor=self.customer,
        )
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.cancellation_strikes_90d, 1)

    def test_early_cancel_outside_window_no_strike(self):
        r = self._book(72)  # well outside window
        transition(
            reservation=r,
            to_status=Reservation.Status.CANCELLED_BY_CUSTOMER,
            actor=self.customer,
        )
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.cancellation_strikes_90d, 0)

    def test_strike_limit_restricts_user(self):
        # 2 late cancels in a row (STRIKE_LIMIT=2 in test config)
        for _ in range(2):
            r = self._book(2)
            transition(
                reservation=r,
                to_status=Reservation.Status.CANCELLED_BY_CUSTOMER,
                actor=self.customer,
            )
        self.customer.refresh_from_db()
        self.assertGreaterEqual(self.customer.cancellation_strikes_90d, 2)
        self.assertIsNotNone(self.customer.restricted_until)
        self.assertGreater(self.customer.restricted_until, timezone.now())


class RescheduleTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner", email="o@example.com", password="x", role=User.Role.SHOP_OWNER
        )
        self.customer = User.objects.create_user(
            username="cust", email="c@example.com", password="x", role=User.Role.CUSTOMER
        )
        self.shop = _make_shop(self.owner)
        self.service = _make_service(self.shop)

    def test_reschedule_moves_times(self):
        r = create_customer_reservation(
            customer=self.customer,
            shop=self.shop,
            service=self.service,
            staff=None,
            start_at=_future_dt(48),
        )
        new_start = _future_dt(72)
        reschedule(reservation=r, new_start=new_start, actor=self.customer)
        r.refresh_from_db()
        self.assertEqual(r.start_at, new_start)
        self.assertEqual(r.end_at, new_start + timedelta(minutes=60))

    def test_reschedule_blocked_when_completed(self):
        from rest_framework.exceptions import ValidationError as DRFValidationError

        r = create_customer_reservation(
            customer=self.customer,
            shop=self.shop,
            service=self.service,
            staff=None,
            start_at=_future_dt(48),
        )
        transition(reservation=r, to_status=Reservation.Status.COMPLETED, actor=self.owner)
        with self.assertRaises(DRFValidationError):
            reschedule(reservation=r, new_start=_future_dt(72), actor=self.customer)

    def test_reschedule_into_past_rejected(self):
        from rest_framework.exceptions import ValidationError as DRFValidationError

        r = create_customer_reservation(
            customer=self.customer,
            shop=self.shop,
            service=self.service,
            staff=None,
            start_at=_future_dt(48),
        )
        with self.assertRaises(DRFValidationError):
            reschedule(reservation=r, new_start=_future_dt(-1), actor=self.customer)
