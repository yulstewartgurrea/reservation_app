"""Tests for "Any available" staff handling.

Covers the union availability across eligible staff, least-loaded
auto-assignment at booking, eligibility filtering, and the staff-less
fallback. See app_ideas.md §8 / README "Any available" notes.
"""

from datetime import datetime, time, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from apps.core.test_factories import (
    make_customer,
    make_service,
    make_shop,
    make_staff,
)
from apps.reservations.availability import (
    assign_least_loaded_staff,
    compute_slots,
    compute_slots_any,
    eligible_staff,
)
from apps.reservations.services import create_customer_reservation
from apps.services.models import StaffService

User = get_user_model()


def _future_date(days: int = 7):
    return (timezone.localtime() + timedelta(days=days)).date()


def _at(d, hour: int, minute: int = 0) -> datetime:
    return datetime.combine(
        d, time(hour, minute), tzinfo=timezone.get_current_timezone()
    )


def _set_hours(staff, start: time, end: time):
    staff.working_hours.update(start_time=start, end_time=end, is_off=False)


def _starts(slots) -> set:
    return {s.start_at for s in slots}


class UnionAvailabilityTests(TestCase):
    def setUp(self):
        self.shop = make_shop()
        self.service = make_service(shop=self.shop, duration=60, buffer_=0)
        self.alice = make_staff(shop=self.shop, name="Alice")
        self.bob = make_staff(shop=self.shop, name="Bob")
        self.date = _future_date()

    def test_union_keeps_slot_when_only_one_staff_is_booked(self):
        """A booked Alice must not hide the 10:00 slot — Bob is still free.

        This is the core fix vs. the old shop-level behaviour where any
        single booking removed the slot for everyone.
        """
        create_customer_reservation(
            customer=make_customer(),
            shop=self.shop,
            service=self.service,
            staff=self.alice,
            start_at=_at(self.date, 10),
        )
        union = _starts(compute_slots_any(self.shop, self.service, self.date))
        alice_only = _starts(
            compute_slots(self.shop, self.service, self.alice, self.date)
        )
        self.assertIn(_at(self.date, 10), union)
        self.assertNotIn(_at(self.date, 10), alice_only)

    def test_union_spans_combined_working_hours(self):
        _set_hours(self.alice, time(8, 0), time(12, 0))
        _set_hours(self.bob, time(14, 0), time(18, 0))
        union = _starts(compute_slots_any(self.shop, self.service, self.date))
        self.assertIn(_at(self.date, 8), union)  # Alice's window
        self.assertIn(_at(self.date, 14), union)  # Bob's window
        self.assertNotIn(_at(self.date, 13), union)  # neither works 13:00

    def test_eligibility_restricts_union_to_configured_staff(self):
        StaffService.objects.create(staff=self.alice, service=self.service)
        create_customer_reservation(
            customer=make_customer(),
            shop=self.shop,
            service=self.service,
            staff=self.alice,
            start_at=_at(self.date, 10),
        )
        union = _starts(compute_slots_any(self.shop, self.service, self.date))
        # Only Alice is eligible and she is busy at 10:00 — Bob can't cover.
        self.assertNotIn(_at(self.date, 10), union)
        self.assertIn(_at(self.date, 9), union)  # Alice free at 09:00

    def test_inactive_staff_is_excluded(self):
        self.bob.is_active = False
        self.bob.save(update_fields=["is_active"])
        create_customer_reservation(
            customer=make_customer(),
            shop=self.shop,
            service=self.service,
            staff=self.alice,
            start_at=_at(self.date, 10),
        )
        union = _starts(compute_slots_any(self.shop, self.service, self.date))
        self.assertNotIn(_at(self.date, 10), union)  # inactive Bob can't cover

    def test_staffless_shop_falls_back_to_shop_level(self):
        shop = make_shop()
        service = make_service(shop=shop, duration=60)
        union = compute_slots_any(shop, service, self.date)
        shop_level = compute_slots(shop, service, None, self.date)
        self.assertTrue(union)
        self.assertEqual(_starts(union), _starts(shop_level))

    def test_all_eligible_staff_off_returns_empty(self):
        self.alice.working_hours.update(is_off=True)
        self.bob.working_hours.update(is_off=True)
        self.assertEqual(compute_slots_any(self.shop, self.service, self.date), [])

    def test_eligible_staff_helper_defaults_to_all_active(self):
        self.assertEqual(
            [s.id for s in eligible_staff(self.shop, self.service)],
            sorted([self.alice.id, self.bob.id]),
        )
        StaffService.objects.create(staff=self.bob, service=self.service)
        self.assertEqual(
            [s.id for s in eligible_staff(self.shop, self.service)], [self.bob.id]
        )


class AutoAssignTests(TestCase):
    def setUp(self):
        self.shop = make_shop()
        self.service = make_service(shop=self.shop, duration=60, buffer_=0)
        self.alice = make_staff(shop=self.shop, name="Alice")
        self.bob = make_staff(shop=self.shop, name="Bob")
        self.date = _future_date()
        self.customer = make_customer()

    def test_book_any_assigns_a_concrete_staff(self):
        r = create_customer_reservation(
            customer=self.customer,
            shop=self.shop,
            service=self.service,
            staff=None,
            start_at=_at(self.date, 10),
        )
        self.assertIn(r.staff_id, {self.alice.id, self.bob.id})

    def test_book_any_picks_least_loaded_staff(self):
        # Alice already has two bookings that day; Bob has none.
        for hour in (12, 14):
            create_customer_reservation(
                customer=make_customer(),
                shop=self.shop,
                service=self.service,
                staff=self.alice,
                start_at=_at(self.date, hour),
            )
        r = create_customer_reservation(
            customer=self.customer,
            shop=self.shop,
            service=self.service,
            staff=None,
            start_at=_at(self.date, 10),
        )
        self.assertEqual(r.staff_id, self.bob.id)

    def test_tie_breaks_by_staff_id_when_load_equal(self):
        assigned = assign_least_loaded_staff(
            self.shop, self.service, _at(self.date, 10)
        )
        self.assertEqual(assigned.id, min(self.alice.id, self.bob.id))

    def test_assigns_only_a_free_staff_even_if_more_loaded(self):
        # Bob is busier overall but Alice is the one busy at 10:00,
        # so the 10:00 booking must go to Bob (the only one free then).
        create_customer_reservation(
            customer=make_customer(),
            shop=self.shop,
            service=self.service,
            staff=self.alice,
            start_at=_at(self.date, 10),
        )
        for hour in (13, 15):
            create_customer_reservation(
                customer=make_customer(),
                shop=self.shop,
                service=self.service,
                staff=self.bob,
                start_at=_at(self.date, hour),
            )
        r = create_customer_reservation(
            customer=self.customer,
            shop=self.shop,
            service=self.service,
            staff=None,
            start_at=_at(self.date, 10),
        )
        self.assertEqual(r.staff_id, self.bob.id)

    def test_book_any_raises_when_all_eligible_staff_busy(self):
        for staff in (self.alice, self.bob):
            create_customer_reservation(
                customer=make_customer(),
                shop=self.shop,
                service=self.service,
                staff=staff,
                start_at=_at(self.date, 10),
            )
        with self.assertRaises(ValidationError):
            create_customer_reservation(
                customer=self.customer,
                shop=self.shop,
                service=self.service,
                staff=None,
                start_at=_at(self.date, 10),
            )

    def test_specific_staff_path_is_unchanged(self):
        create_customer_reservation(
            customer=make_customer(),
            shop=self.shop,
            service=self.service,
            staff=self.alice,
            start_at=_at(self.date, 10),
        )
        with self.assertRaises(ValidationError):
            create_customer_reservation(
                customer=self.customer,
                shop=self.shop,
                service=self.service,
                staff=self.alice,
                start_at=_at(self.date, 10),
            )
        # A different staff at the same time is still fine.
        ok = create_customer_reservation(
            customer=self.customer,
            shop=self.shop,
            service=self.service,
            staff=self.bob,
            start_at=_at(self.date, 10),
        )
        self.assertEqual(ok.staff_id, self.bob.id)

    def test_staffless_shop_books_null_staff_with_legacy_conflict(self):
        shop = make_shop()
        service = make_service(shop=shop, duration=60)
        r = create_customer_reservation(
            customer=self.customer,
            shop=shop,
            service=service,
            staff=None,
            start_at=_at(self.date, 10),
        )
        self.assertIsNone(r.staff_id)
        with self.assertRaises(ValidationError):
            create_customer_reservation(
                customer=make_customer(),
                shop=shop,
                service=service,
                staff=None,
                start_at=_at(self.date, 10),
            )

    def test_ineligible_staff_never_auto_assigned(self):
        StaffService.objects.create(staff=self.alice, service=self.service)
        # Only Alice eligible; she is booked at 10:00 → must raise, never
        # silently assign the ineligible Bob.
        create_customer_reservation(
            customer=make_customer(),
            shop=self.shop,
            service=self.service,
            staff=self.alice,
            start_at=_at(self.date, 10),
        )
        with self.assertRaises(ValidationError):
            create_customer_reservation(
                customer=self.customer,
                shop=self.shop,
                service=self.service,
                staff=None,
                start_at=_at(self.date, 10),
            )


class AvailabilityEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.shop = make_shop()
        self.service = make_service(shop=self.shop, duration=60, buffer_=0)
        self.alice = make_staff(shop=self.shop, name="Alice")
        self.bob = make_staff(shop=self.shop, name="Bob")
        self.date = _future_date()
        create_customer_reservation(
            customer=make_customer(),
            shop=self.shop,
            service=self.service,
            staff=self.alice,
            start_at=_at(self.date, 10),
        )

    def _get(self, **params):
        params.setdefault("shop", self.shop.id)
        params.setdefault("service", self.service.id)
        params.setdefault("date", self.date.isoformat())
        return self.client.get("/api/reservations/availability/", params)

    def test_endpoint_without_staff_uses_union(self):
        resp = self._get()
        self.assertEqual(resp.status_code, 200)
        starts = {row["start_at"] for row in resp.json()}
        self.assertIn(_at(self.date, 10).isoformat(), starts)  # Bob covers

    def test_endpoint_with_staff_is_per_staff(self):
        resp = self._get(staff=self.alice.id)
        self.assertEqual(resp.status_code, 200)
        starts = {row["start_at"] for row in resp.json()}
        self.assertNotIn(_at(self.date, 10).isoformat(), starts)  # Alice busy

    def test_book_endpoint_any_sets_concrete_staff(self):
        customer = make_customer()
        self.client.force_authenticate(customer)
        resp = self.client.post(
            "/api/reservations/book/",
            {
                "shop": self.shop.id,
                "service": self.service.id,
                "staff": None,
                "start_at": _at(self.date, 11).isoformat(),
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertIsNotNone(resp.json()["staff"])
