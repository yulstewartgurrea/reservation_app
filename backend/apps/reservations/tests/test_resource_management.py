"""Resource lifecycle around bookings: walk-ins, reschedule re-allocation,
owner CRUD endpoints, the data-migration backfill, and concurrent allocation.
"""

import importlib
from datetime import datetime, time, timedelta
from decimal import Decimal

from django.apps import apps as global_apps
from django.db import connection
from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from apps.core.test_factories import (
    make_customer,
    make_resource,
    make_service,
    make_shop,
    make_shop_owner,
    make_staff,
)
from apps.reservations.models import Reservation
from apps.reservations.services import (
    create_customer_reservation,
    create_walk_in,
    reschedule,
)
from apps.shops.models import Resource


def _future_date(days: int = 7):
    return (timezone.localtime() + timedelta(days=days)).date()


def _at(d, hour: int, minute: int = 0) -> datetime:
    return datetime.combine(
        d, time(hour, minute), tzinfo=timezone.get_current_timezone()
    )


class WalkInResourceTests(TestCase):
    def setUp(self):
        self.owner = make_shop_owner()
        self.shop = make_shop(owner=self.owner, resources=2)
        self.service = make_service(shop=self.shop, duration=60)
        self.date = _future_date()
        self.r1, self.r2 = Resource.objects.filter(shop=self.shop).order_by("id")

    def test_walk_in_honours_explicit_resource(self):
        r = create_walk_in(
            shop_owner=self.owner,
            shop=self.shop,
            service=self.service,
            start_at=_at(self.date, 10),
            resource=self.r2,
            guest_name="Walk Guy",
        )
        self.assertEqual(r.resource_id, self.r2.id)

    def test_walk_in_auto_assigns_when_no_resource_given(self):
        r = create_walk_in(
            shop_owner=self.owner,
            shop=self.shop,
            service=self.service,
            start_at=_at(self.date, 10),
            guest_name="Walk Guy",
        )
        self.assertEqual(r.resource_id, self.r1.id)

    def test_walk_in_explicit_resource_conflict_raises(self):
        create_walk_in(
            shop_owner=self.owner,
            shop=self.shop,
            service=self.service,
            start_at=_at(self.date, 10),
            resource=self.r1,
            guest_name="A",
        )
        with self.assertRaises(ValidationError):
            create_walk_in(
                shop_owner=self.owner,
                shop=self.shop,
                service=self.service,
                start_at=_at(self.date, 10),
                resource=self.r1,
                guest_name="B",
            )


class RescheduleResourceTests(TestCase):
    def setUp(self):
        self.shop = make_shop(resources=1)
        self.service = make_service(shop=self.shop, duration=60)
        self.date = _future_date()

    def test_reschedule_keeps_resource_when_free(self):
        r = create_customer_reservation(
            customer=make_customer(),
            shop=self.shop,
            service=self.service,
            start_at=_at(self.date, 10),
        )
        original = r.resource_id
        reschedule(reservation=r, new_start=_at(self.date, 14), actor=r.customer)
        self.assertEqual(r.resource_id, original)
        self.assertEqual(r.start_at, _at(self.date, 14))

    def test_reschedule_into_full_slot_rejected(self):
        r = create_customer_reservation(
            customer=make_customer(),
            shop=self.shop,
            service=self.service,
            start_at=_at(self.date, 10),
        )
        # Fill 14:00 on the only station with another booking.
        create_customer_reservation(
            customer=make_customer(),
            shop=self.shop,
            service=self.service,
            start_at=_at(self.date, 14),
        )
        with self.assertRaises(ValidationError):
            reschedule(reservation=r, new_start=_at(self.date, 14), actor=r.customer)

    def test_reschedule_moves_to_other_resource_when_first_busy(self):
        shop = make_shop(resources=2)
        service = make_service(shop=shop, duration=60)
        r1, r2 = Resource.objects.filter(shop=shop).order_by("id")
        # Booking A lands on r1 at 10:00.
        a = create_customer_reservation(
            customer=make_customer(), shop=shop, service=service,
            start_at=_at(self.date, 10),
        )
        self.assertEqual(a.resource_id, r1.id)
        # Booking B lands on r1 at 14:00 (r1 lowest-id and free).
        b = create_customer_reservation(
            customer=make_customer(), shop=shop, service=service,
            start_at=_at(self.date, 14),
        )
        self.assertEqual(b.resource_id, r1.id)
        # Reschedule A onto 14:00: r1 is taken by B, so A must move to r2.
        reschedule(reservation=a, new_start=_at(self.date, 14), actor=a.customer)
        self.assertEqual(a.resource_id, r2.id)


class ResourceCrudEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = make_shop_owner()
        self.shop = make_shop(owner=self.owner, resources=1)

    def test_owner_can_create_resource(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.post(
            "/api/shops/resources/",
            {"shop": self.shop.id, "name": "Bay 2"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertTrue(Resource.objects.filter(shop=self.shop, name="Bay 2").exists())

    def test_non_owner_cannot_create_resource(self):
        outsider = make_shop_owner()
        self.client.force_authenticate(outsider)
        resp = self.client.post(
            "/api/shops/resources/",
            {"shop": self.shop.id, "name": "Sneaky"},
            format="json",
        )
        self.assertIn(resp.status_code, (403, 400))
        self.assertFalse(Resource.objects.filter(name="Sneaky").exists())

    def test_list_public_shows_active_only(self):
        retired = make_resource(shop=self.shop, name="Old")
        retired.is_active = False
        retired.save(update_fields=["is_active"])
        resp = self.client.get(f"/api/shops/resources/?shop={self.shop.id}")
        self.assertEqual(resp.status_code, 200)
        rows = resp.json()["results"]  # global PageNumberPagination
        names = {row["name"] for row in rows}
        self.assertNotIn("Old", names)

    def test_owner_can_rename(self):
        self.client.force_authenticate(self.owner)
        res = Resource.objects.filter(shop=self.shop).first()
        resp = self.client.patch(
            f"/api/shops/resources/{res.id}/", {"name": "Renamed"}, format="json"
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        res.refresh_from_db()
        self.assertEqual(res.name, "Renamed")

    def test_delete_with_reservations_soft_retires(self):
        self.client.force_authenticate(self.owner)
        service = make_service(shop=self.shop, duration=60)
        r = create_customer_reservation(
            customer=make_customer(), shop=self.shop, service=service,
            start_at=_at(_future_date(), 10),
        )
        res_id = r.resource_id
        resp = self.client.delete(f"/api/shops/resources/{res_id}/")
        self.assertIn(resp.status_code, (200, 204))
        res = Resource.objects.get(pk=res_id)  # still exists
        self.assertFalse(res.is_active)

    def test_delete_unused_hard_deletes(self):
        self.client.force_authenticate(self.owner)
        res = make_resource(shop=self.shop, name="Spare")
        resp = self.client.delete(f"/api/shops/resources/{res.id}/")
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(Resource.objects.filter(pk=res.id).exists())


class BackfillMigrationTests(TestCase):
    """Exercises the 0007 data-migration function directly against historical-
    shaped rows (Resources stripped, reservations with resource=None)."""

    def _backfill(self):
        mod = importlib.import_module(
            "apps.reservations.migrations.0007_backfill_resources"
        )
        mod.backfill(global_apps, None)

    def _raw_reservation(self, shop, service, start, status):
        return Reservation.objects.create(
            shop=shop,
            service=service,
            resource=None,
            start_at=start,
            end_at=start + timedelta(minutes=60),
            status=status,
            unit_price=Decimal("100.00"),
            total_price=Decimal("100.00"),
        )

    def test_single_staff_shop_gets_one_resource(self):
        shop = make_shop(resources=0)
        make_staff(shop=shop, name="Solo")
        service = make_service(shop=shop, duration=60)
        date = _future_date()
        a = self._raw_reservation(shop, service, _at(date, 10), Reservation.Status.CONFIRMED)
        b = self._raw_reservation(shop, service, _at(date, 12), Reservation.Status.CONFIRMED)
        Resource.objects.filter(shop=shop).delete()

        self._backfill()

        self.assertEqual(Resource.objects.filter(shop=shop).count(), 1)
        a.refresh_from_db(); b.refresh_from_db()
        self.assertEqual(a.resource_id, b.resource_id)  # non-overlapping share one

    def test_overlapping_bookings_get_distinct_resources(self):
        shop = make_shop(resources=0)
        make_staff(shop=shop, name="One")
        make_staff(shop=shop, name="Two")  # 2 active staff -> seed pool of 2
        service = make_service(shop=shop, duration=60)
        date = _future_date()
        a = self._raw_reservation(shop, service, _at(date, 10), Reservation.Status.CONFIRMED)
        b = self._raw_reservation(shop, service, _at(date, 10), Reservation.Status.CONFIRMED)
        Resource.objects.filter(shop=shop).delete()

        self._backfill()

        self.assertEqual(Resource.objects.filter(shop=shop).count(), 2)
        a.refresh_from_db(); b.refresh_from_db()
        self.assertNotEqual(a.resource_id, b.resource_id)

    def test_every_reservation_assigned(self):
        shop = make_shop(resources=0)
        service = make_service(shop=shop, duration=60)
        date = _future_date()
        self._raw_reservation(shop, service, _at(date, 10), Reservation.Status.CANCELLED_BY_SHOP)
        Resource.objects.filter(shop=shop).delete()

        self._backfill()

        self.assertFalse(
            Reservation.objects.filter(shop=shop, resource__isnull=True).exists()
        )


class ConcurrentAllocationTests(TransactionTestCase):
    """Two simultaneous bookings for the same single-Resource slot: exactly one
    must win. Meaningful only on a backend with real row locking (Postgres);
    skipped on SQLite, which the test settings use by default."""

    def test_no_double_allocation_under_concurrency(self):
        if connection.vendor != "postgresql":
            self.skipTest("select_for_update needs PostgreSQL")

        import threading

        shop = make_shop(resources=1)
        service = make_service(shop=shop, duration=60)
        start = _at(_future_date(), 10)
        results = []

        def book():
            try:
                r = create_customer_reservation(
                    customer=make_customer(), shop=shop, service=service,
                    start_at=start,
                )
                results.append(("ok", r.id))
            except ValidationError:
                results.append(("conflict", None))
            finally:
                connection.close()

        t1, t2 = threading.Thread(target=book), threading.Thread(target=book)
        t1.start(); t2.start(); t1.join(); t2.join()

        oks = [x for x in results if x[0] == "ok"]
        self.assertEqual(len(oks), 1, results)
        self.assertEqual(Reservation.objects.filter(shop=shop).count(), 1)
