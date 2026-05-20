"""Resource-based scheduling: capacity, conflicts, and the non-binding staff
request.

The binding scheduling unit is the Resource (bay / chair / room / slot). A shop
with N Resources can take N concurrent bookings; staff is recorded only as an
optional, non-binding request and never affects availability. See
shops.Resource and app_ideas.md §8.17.
"""

from datetime import datetime, time, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from apps.core.test_factories import (
    make_customer,
    make_resource,
    make_service,
    make_shop,
    make_staff,
)
from apps.reservations.availability import (
    assign_available_resource,
    compute_slots,
    compute_slots_any,
)
from apps.reservations.models import Reservation
from apps.reservations.services import create_customer_reservation
from apps.shops.models import Resource, TimeBlock

User = get_user_model()


def _future_date(days: int = 7):
    return (timezone.localtime() + timedelta(days=days)).date()


def _at(d, hour: int, minute: int = 0) -> datetime:
    return datetime.combine(
        d, time(hour, minute), tzinfo=timezone.get_current_timezone()
    )


def _starts(slots) -> set:
    return {s.start_at for s in slots}


def _book(shop, service, start, **kw):
    return create_customer_reservation(
        customer=kw.pop("customer", None) or make_customer(),
        shop=shop,
        service=service,
        start_at=start,
        **kw,
    )


class ResourceCapacityTests(TestCase):
    def setUp(self):
        self.shop = make_shop(resources=2)  # two stations
        self.service = make_service(shop=self.shop, duration=60, buffer_=0)
        self.date = _future_date()

    def test_single_resource_blocks_second_booking_same_time(self):
        shop = make_shop(resources=1)
        service = make_service(shop=shop, duration=60)
        _book(shop, service, _at(self.date, 10))
        with self.assertRaises(ValidationError):
            _book(shop, service, _at(self.date, 10))

    def test_two_resources_allow_two_concurrent_bookings(self):
        r1 = _book(self.shop, self.service, _at(self.date, 10))
        r2 = _book(self.shop, self.service, _at(self.date, 10))
        self.assertNotEqual(r1.resource_id, r2.resource_id)
        # Third at the same time has no free station -> rejected.
        with self.assertRaises(ValidationError):
            _book(self.shop, self.service, _at(self.date, 10))

    def test_capacity_equals_resource_count(self):
        shop = make_shop(resources=3)
        service = make_service(shop=shop, duration=60)
        used = set()
        for _ in range(3):
            used.add(_book(shop, service, _at(self.date, 10)).resource_id)
        self.assertEqual(len(used), 3)  # three distinct stations
        with self.assertRaises(ValidationError):
            _book(shop, service, _at(self.date, 10))

    def test_lowest_id_resource_assigned_first(self):
        first = Resource.objects.filter(shop=self.shop).order_by("id").first()
        r = _book(self.shop, self.service, _at(self.date, 10))
        self.assertEqual(r.resource_id, first.id)

    def test_cancelled_reservation_frees_the_resource(self):
        shop = make_shop(resources=1)
        service = make_service(shop=shop, duration=60)
        r = _book(shop, service, _at(self.date, 10))
        from apps.reservations.services import transition

        transition(
            reservation=r,
            to_status=Reservation.Status.CANCELLED_BY_CUSTOMER,
            actor=r.customer,
        )
        # The station is free again.
        ok = _book(shop, service, _at(self.date, 10))
        self.assertEqual(ok.resource_id, r.resource_id)

    def test_buffer_extends_the_block_window_forward(self):
        # buffer is added to the *creating* booking's block window (not stored
        # in end_at). A booking at 10:00 (dur 60 + buffer 30) occupies the
        # station to 11:30, so it must clash with an existing 11:00 booking.
        shop = make_shop(resources=1)
        service = make_service(shop=shop, duration=60, buffer_=30)
        _book(shop, service, _at(self.date, 11))  # stored 11:00-12:00
        with self.assertRaises(ValidationError):
            _book(shop, service, _at(self.date, 10))  # window 10:00-11:30 clashes
        # A booking ending its buffer before 11:00 is fine (9:00 -> 10:30).
        ok = _book(shop, service, _at(self.date, 9))
        self.assertIsNotNone(ok.id)


class StaffIsNonBindingTests(TestCase):
    def setUp(self):
        self.shop = make_shop(resources=2)
        self.service = make_service(shop=self.shop, duration=60)
        self.juan = make_staff(shop=self.shop, name="Juan")
        self.date = _future_date()

    def test_same_staff_on_two_overlapping_bookings_is_allowed(self):
        r1 = _book(self.shop, self.service, _at(self.date, 10), staff=self.juan)
        r2 = _book(self.shop, self.service, _at(self.date, 10), staff=self.juan)
        # Both succeed (two stations) even though Juan is "requested" twice —
        # staff never gates availability.
        self.assertEqual(r1.staff_id, self.juan.id)
        self.assertEqual(r2.staff_id, self.juan.id)
        self.assertNotEqual(r1.resource_id, r2.resource_id)

    def test_staff_request_is_recorded(self):
        r = _book(self.shop, self.service, _at(self.date, 10), staff=self.juan)
        self.assertEqual(r.staff_id, self.juan.id)

    def test_booking_without_staff_request_works(self):
        r = _book(self.shop, self.service, _at(self.date, 10))
        self.assertIsNone(r.staff_id)
        self.assertIsNotNone(r.resource_id)


class TimeBlockTests(TestCase):
    def setUp(self):
        self.shop = make_shop(resources=2)
        self.service = make_service(shop=self.shop, duration=60)
        self.date = _future_date()
        self.r1, self.r2 = Resource.objects.filter(shop=self.shop).order_by("id")

    def test_block_on_one_resource_leaves_the_other_free(self):
        TimeBlock.objects.create(
            shop=self.shop,
            resource=self.r1,
            start_at=_at(self.date, 10),
            end_at=_at(self.date, 11),
        )
        # r1 blocked at 10:00, so only r2 is bookable -> exactly one booking.
        r = _book(self.shop, self.service, _at(self.date, 10))
        self.assertEqual(r.resource_id, self.r2.id)
        with self.assertRaises(ValidationError):
            _book(self.shop, self.service, _at(self.date, 10))

    def test_shopwide_block_removes_all_resources(self):
        TimeBlock.objects.create(
            shop=self.shop,
            start_at=_at(self.date, 10),
            end_at=_at(self.date, 11),
        )
        with self.assertRaises(ValidationError):
            _book(self.shop, self.service, _at(self.date, 10))

    def test_staff_only_block_is_non_binding(self):
        staff = make_staff(shop=self.shop, name="Juan")
        TimeBlock.objects.create(
            shop=self.shop,
            staff=staff,
            start_at=_at(self.date, 10),
            end_at=_at(self.date, 11),
        )
        # A staff-only block does not remove capacity.
        r1 = _book(self.shop, self.service, _at(self.date, 10), staff=staff)
        r2 = _book(self.shop, self.service, _at(self.date, 10))
        self.assertNotEqual(r1.resource_id, r2.resource_id)


class ComputeSlotsTests(TestCase):
    def setUp(self):
        self.shop = make_shop(resources=2)
        self.service = make_service(shop=self.shop, duration=60, buffer_=0)
        self.date = _future_date()

    def test_slot_stays_until_all_resources_busy(self):
        _book(self.shop, self.service, _at(self.date, 10))  # 1 of 2 used
        self.assertIn(_at(self.date, 10), _starts(
            compute_slots_any(self.shop, self.service, self.date)
        ))
        _book(self.shop, self.service, _at(self.date, 10))  # 2 of 2 used
        self.assertNotIn(_at(self.date, 10), _starts(
            compute_slots_any(self.shop, self.service, self.date)
        ))

    def test_per_resource_slots(self):
        r1 = Resource.objects.filter(shop=self.shop).order_by("id").first()
        _book(self.shop, self.service, _at(self.date, 10))  # takes r1 (lowest id)
        r1_slots = _starts(compute_slots(self.shop, self.service, r1, self.date))
        self.assertNotIn(_at(self.date, 10), r1_slots)

    def test_no_active_resources_means_no_slots(self):
        shop = make_shop(resources=0)
        service = make_service(shop=shop, duration=60)
        self.assertEqual(compute_slots_any(shop, service, self.date), [])


class AssignAvailableResourceTests(TestCase):
    def setUp(self):
        self.shop = make_shop(resources=2)
        self.service = make_service(shop=self.shop, duration=60)
        self.date = _future_date()

    def test_returns_lowest_id_free(self):
        first = Resource.objects.filter(shop=self.shop).order_by("id").first()
        got = assign_available_resource(self.shop, self.service, _at(self.date, 10))
        self.assertEqual(got.id, first.id)

    def test_returns_none_when_all_busy(self):
        _book(self.shop, self.service, _at(self.date, 10))
        _book(self.shop, self.service, _at(self.date, 10))
        self.assertIsNone(
            assign_available_resource(self.shop, self.service, _at(self.date, 10))
        )

    def test_inactive_resource_excluded(self):
        extra = make_resource(shop=self.shop)
        extra.is_active = False
        extra.save(update_fields=["is_active"])
        # 2 active stations -> 2 bookings, then full despite the inactive one.
        _book(self.shop, self.service, _at(self.date, 10))
        _book(self.shop, self.service, _at(self.date, 10))
        with self.assertRaises(ValidationError):
            _book(self.shop, self.service, _at(self.date, 10))


class AvailabilityEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.shop = make_shop(resources=1)
        self.service = make_service(shop=self.shop, duration=60, buffer_=0)
        self.date = _future_date()
        _book(self.shop, self.service, _at(self.date, 10))  # fills the 1 station

    def _get(self, **params):
        params.setdefault("shop", self.shop.id)
        params.setdefault("service", self.service.id)
        params.setdefault("date", self.date.isoformat())
        return self.client.get("/api/reservations/availability/", params)

    def test_full_resource_removes_slot(self):
        resp = self._get()
        self.assertEqual(resp.status_code, 200)
        starts = {row["start_at"] for row in resp.json()}
        self.assertNotIn(_at(self.date, 10).isoformat(), starts)

    def test_requested_staff_does_not_narrow_availability(self):
        # A second station + a busy "requested" staff still shows 10:00.
        make_resource(shop=self.shop)
        staff = make_staff(shop=self.shop, name="Juan")
        resp = self._get(staff=staff.id)
        starts = {row["start_at"] for row in resp.json()}
        self.assertIn(_at(self.date, 10).isoformat(), starts)

    def test_book_endpoint_assigns_resource(self):
        customer = make_customer()
        self.client.force_authenticate(customer)
        resp = self.client.post(
            "/api/reservations/book/",
            {
                "shop": self.shop.id,
                "service": self.service.id,
                "start_at": _at(self.date, 11).isoformat(),
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertIsNotNone(resp.json()["resource"])
