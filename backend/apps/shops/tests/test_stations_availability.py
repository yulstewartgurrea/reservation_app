"""Tests for the per-station availability dashboard endpoint.

Backs the shop-owner Stations page redesign — a real-time availability
dashboard that for each Resource ("Station") on a given date returns its
current status, a non-overlapping timeline of available / reserved / blocked
segments, and the supporting bookings + time-blocks payloads.

See:
  * `apps.shops.services.station_day_availability` — the service entry point
  * `ShopViewSet.stations_availability` — the HTTP wrapper
"""

from datetime import datetime, time, timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.shops import services as shop_services

from apps.core.test_factories import (
    make_customer,
    make_resource,
    make_service,
    make_shop,
    make_shop_owner,
    make_staff,
)
from apps.reservations.models import Reservation
from apps.shops.models import HoursOverride, Shop, TimeBlock, WeekdayHours
from apps.shops.services import station_day_availability


def _next_weekday(target_weekday: int = 0):
    """Pick the next instance of `target_weekday` (Mon=0..Sun=6).

    Returning a future date lets us hard-code "now" assertions via a frozen
    `timezone.localtime()` without bumping into "now is past close" edge cases
    if the test happens to run after 5pm.
    """
    today = timezone.localdate()
    delta = (target_weekday - today.weekday()) % 7 or 7
    return today + timedelta(days=delta)


def _aware(dt_date, hour, minute=0):
    tz = timezone.get_current_timezone()
    return timezone.make_aware(datetime.combine(dt_date, time(hour, minute)), tz)


def _make_reservation(*, shop, service, resource, start, end, customer=None, status_=None, guest_name=""):
    """Bypass the production booking pipeline so tests can place reservations
    anywhere on the timeline (including the past) deterministically.

    The dashboard service reads from Reservation directly — it doesn't care
    how the row got there — so creating one this way is exactly what the
    production view will see at request time.
    """
    return Reservation.objects.create(
        customer=customer,
        shop=shop,
        service=service,
        resource=resource,
        start_at=start,
        end_at=end,
        status=status_ or Reservation.Status.CONFIRMED,
        source=Reservation.Source.ONLINE,
        unit_price=service.price,
        total_price=service.price,
        guest_name=guest_name,
    )


class StationDayAvailabilityServiceTests(TestCase):
    """Direct service-layer assertions (no HTTP)."""

    def setUp(self):
        self.owner = make_shop_owner()
        # Two-resource shop, 09:00-17:00 every day.
        self.shop = make_shop(owner=self.owner, resources=2)
        WeekdayHours.objects.filter(shop=self.shop).update(
            is_closed=False, open_time=time(9, 0), close_time=time(17, 0)
        )
        self.service = make_service(shop=self.shop, name="Wash", duration=60)
        self.target = _next_weekday(0)
        self.station1, self.station2 = list(self.shop.resources.order_by("id"))

    # ------------------------------------------------------------------
    # Closed-day branches
    # ------------------------------------------------------------------

    def test_weekday_closed_marks_every_station_closed(self):
        WeekdayHours.objects.filter(shop=self.shop, weekday=self.target.weekday()).update(
            is_closed=True
        )
        result = station_day_availability(self.shop, self.target)
        self.assertTrue(result["shop"]["is_closed"])
        self.assertIsNone(result["shop"]["open_time"])
        for station in result["stations"]:
            self.assertEqual(station["current_status"], "closed")
            self.assertEqual(station["segments"], [])
            self.assertIsNone(station["next_available_at"])
        # Summary counters use the active-resource count even when closed.
        self.assertEqual(result["summary"]["total_stations"], 2)
        self.assertEqual(result["summary"]["available_now"], 0)
        self.assertEqual(result["summary"]["busy_now"], 0)

    def test_hours_override_is_closed_overrides_weekday(self):
        HoursOverride.objects.create(shop=self.shop, date=self.target, is_closed=True)
        result = station_day_availability(self.shop, self.target)
        self.assertTrue(result["shop"]["is_closed"])
        self.assertTrue(all(s["current_status"] == "closed" for s in result["stations"]))

    def test_paused_shop_marks_every_station_closed(self):
        self.shop.status = Shop.Status.PAUSED
        self.shop.save(update_fields=["status"])
        result = station_day_availability(self.shop, self.target)
        self.assertTrue(result["shop"]["is_closed"])
        self.assertTrue(all(s["current_status"] == "closed" for s in result["stations"]))

    # ------------------------------------------------------------------
    # Open day, simple cases
    # ------------------------------------------------------------------

    def test_open_day_no_bookings_yields_one_available_block_per_station(self):
        result = station_day_availability(self.shop, self.target)
        self.assertFalse(result["shop"]["is_closed"])
        self.assertEqual(result["shop"]["open_time"], "09:00")
        self.assertEqual(result["shop"]["close_time"], "17:00")
        for station in result["stations"]:
            self.assertEqual(station["is_active"], True)
            self.assertEqual(len(station["segments"]), 1)
            seg = station["segments"][0]
            self.assertEqual(seg["start"], "09:00")
            self.assertEqual(seg["end"], "17:00")
            self.assertEqual(seg["kind"], "available")

    # ------------------------------------------------------------------
    # Midday reservation: segments, current_status, busy_until,
    # next_available_at  (covers "now" before / inside / after the booking).
    # ------------------------------------------------------------------

    def _build_midday_booking_fixture(self):
        # Customer is named so we can assert the label formatting.
        customer = make_customer()
        customer.first_name = "Jane"
        customer.last_name = "Doe"
        customer.save(update_fields=["first_name", "last_name"])
        start = _aware(self.target, 10, 30)
        end = _aware(self.target, 12, 0)
        _make_reservation(
            shop=self.shop,
            service=self.service,
            resource=self.station1,
            start=start,
            end=end,
            customer=customer,
        )
        return start, end

    def test_midday_booking_splits_segments(self):
        self._build_midday_booking_fixture()
        result = station_day_availability(self.shop, self.target)
        segments = result["stations"][0]["segments"]
        # Expected: 09:00-10:30 available, 10:30-12:00 reserved, 12:00-17:00 available.
        self.assertEqual([s["start"] for s in segments], ["09:00", "10:30", "12:00"])
        self.assertEqual([s["end"] for s in segments], ["10:30", "12:00", "17:00"])
        kinds = [s["kind"] for s in segments]
        self.assertEqual(kinds, ["available", "reserved", "available"])
        self.assertEqual(segments[1]["label"], "Jane D. — Wash")
        # The unbusy second station is untouched.
        s2 = result["stations"][1]
        self.assertEqual(len(s2["segments"]), 1)
        self.assertEqual(s2["segments"][0]["kind"], "available")

    def _frozen_now(self, hour, minute=0):
        """Anchor `timezone.localtime()` at `target @ hour:minute`.

        Patches the symbol *inside `apps.shops.services`* (where the dashboard
        builder calls `timezone.localtime()` with no argument) so the global
        `timezone.localtime(some_dt)` call sites in `_format_hm` keep behaving
        normally. We replace the whole `timezone` module reference rather than
        a single function — a tiny stub object covers the two calls actually
        used by the service.
        """
        frozen = _aware(self.target, hour, minute)

        class _FrozenTimezone:
            @staticmethod
            def localtime(value=None):
                if value is None:
                    return frozen
                return timezone.localtime(value)

            # Pass-throughs the service module references.
            get_current_timezone = staticmethod(timezone.get_current_timezone)
            make_aware = staticmethod(timezone.make_aware)
            localdate = staticmethod(lambda: frozen.date())
            now = staticmethod(timezone.now)

        return _FrozenTimezone

    def test_now_inside_booking_marks_station_busy(self):
        self._build_midday_booking_fixture()
        # Pretend "now" is 11:00 on the target date.
        with patch.object(shop_services, "timezone", self._frozen_now(11, 0)):
            result = station_day_availability(self.shop, self.target)
        station1 = result["stations"][0]
        self.assertEqual(station1["current_status"], "busy")
        self.assertEqual(station1["busy_until"], "12:00")
        self.assertEqual(station1["next_available_at"], "12:00")
        self.assertEqual(result["summary"]["busy_now"], 1)
        self.assertEqual(result["summary"]["available_now"], 1)

    def test_now_before_booking_marks_station_available_with_next_hint(self):
        self._build_midday_booking_fixture()
        with patch.object(shop_services, "timezone", self._frozen_now(10, 0)):
            result = station_day_availability(self.shop, self.target)
        station1 = result["stations"][0]
        self.assertEqual(station1["current_status"], "available")
        self.assertIsNone(station1["busy_until"])
        # Next available *after* the upcoming reservation.
        self.assertEqual(station1["next_available_at"], "12:00")

    def test_now_after_booking_no_remaining_busy_intervals(self):
        self._build_midday_booking_fixture()
        with patch.object(shop_services, "timezone", self._frozen_now(13, 0)):
            result = station_day_availability(self.shop, self.target)
        station1 = result["stations"][0]
        self.assertEqual(station1["current_status"], "available")
        self.assertIsNone(station1["next_available_at"])

    # ------------------------------------------------------------------
    # Inactive resource
    # ------------------------------------------------------------------

    def test_inactive_resource_is_offline_and_excluded_from_summary(self):
        self.station2.is_active = False
        self.station2.save(update_fields=["is_active"])
        result = station_day_availability(self.shop, self.target)
        # Active station(s) still in summary.
        self.assertEqual(result["summary"]["total_stations"], 1)
        # Inactive station present but offline.
        inactive = next(s for s in result["stations"] if s["id"] == self.station2.id)
        self.assertEqual(inactive["current_status"], "offline")
        self.assertEqual(inactive["segments"], [])
        self.assertFalse(inactive["is_active"])

    # ------------------------------------------------------------------
    # Time-block branches
    # ------------------------------------------------------------------

    def test_shop_wide_time_block_blocks_every_active_station(self):
        TimeBlock.objects.create(
            shop=self.shop,
            resource=None,
            staff=None,
            start_at=_aware(self.target, 12, 0),
            end_at=_aware(self.target, 13, 0),
            reason="Lunch",
        )
        result = station_day_availability(self.shop, self.target)
        for station in result["stations"]:
            kinds = [s["kind"] for s in station["segments"]]
            self.assertIn("blocked", kinds)
            blocked_seg = next(s for s in station["segments"] if s["kind"] == "blocked")
            self.assertEqual(blocked_seg["start"], "12:00")
            self.assertEqual(blocked_seg["end"], "13:00")
            self.assertEqual(blocked_seg["label"], "Lunch")

    def test_resource_specific_time_block_only_blocks_that_station(self):
        TimeBlock.objects.create(
            shop=self.shop,
            resource=self.station1,
            staff=None,
            start_at=_aware(self.target, 15, 0),
            end_at=_aware(self.target, 16, 0),
            reason="Cleaning",
        )
        result = station_day_availability(self.shop, self.target)
        s1, s2 = result["stations"]
        kinds_1 = [s["kind"] for s in s1["segments"]]
        kinds_2 = [s["kind"] for s in s2["segments"]]
        self.assertIn("blocked", kinds_1)
        self.assertNotIn("blocked", kinds_2)
        self.assertEqual(s2["segments"], [{"start": "09:00", "end": "17:00", "kind": "available"}])

    def test_staff_only_time_block_does_not_affect_availability(self):
        staff = make_staff(shop=self.shop, name="Alex")
        TimeBlock.objects.create(
            shop=self.shop,
            resource=None,
            staff=staff,
            start_at=_aware(self.target, 14, 0),
            end_at=_aware(self.target, 15, 0),
            reason="PTO",
        )
        result = station_day_availability(self.shop, self.target)
        for station in result["stations"]:
            kinds = [s["kind"] for s in station["segments"]]
            self.assertNotIn("blocked", kinds)
            self.assertEqual(len(station["segments"]), 1)

    def test_reservation_overlapping_block_is_labelled_reserved(self):
        # Block 10:00-12:00 shop-wide, then book on station1 11:00-11:30
        # (squarely inside the block). The overlap should render as "reserved"
        # on station1, while station2 still shows the full block.
        TimeBlock.objects.create(
            shop=self.shop,
            resource=None,
            staff=None,
            start_at=_aware(self.target, 10, 0),
            end_at=_aware(self.target, 12, 0),
            reason="Maintenance",
        )
        _make_reservation(
            shop=self.shop,
            service=self.service,
            resource=self.station1,
            start=_aware(self.target, 11, 0),
            end=_aware(self.target, 11, 30),
            customer=make_customer(),
            guest_name="",
        )
        result = station_day_availability(self.shop, self.target)
        s1 = next(s for s in result["stations"] if s["id"] == self.station1.id)
        # Expected order on station1: available 09-10, blocked 10-11,
        # reserved 11-11:30, blocked 11:30-12, available 12-17.
        kinds = [s["kind"] for s in s1["segments"]]
        self.assertEqual(kinds, ["available", "blocked", "reserved", "blocked", "available"])
        # Station 2 sees the unaltered block.
        s2 = next(s for s in result["stations"] if s["id"] == self.station2.id)
        kinds_2 = [s["kind"] for s in s2["segments"]]
        self.assertEqual(kinds_2, ["available", "blocked", "available"])

    # ------------------------------------------------------------------
    # Cosmetics / guest-name handling
    # ------------------------------------------------------------------

    def test_guest_reservation_label_uses_guest_name(self):
        _make_reservation(
            shop=self.shop,
            service=self.service,
            resource=self.station1,
            start=_aware(self.target, 10, 0),
            end=_aware(self.target, 10, 30),
            customer=None,
            guest_name="Walkin Mike",
        )
        result = station_day_availability(self.shop, self.target)
        seg = next(s for s in result["stations"][0]["segments"] if s["kind"] == "reserved")
        self.assertEqual(seg["label"], "Walkin Mike — Wash")

    def test_label_truncates_when_too_long(self):
        long_service = make_service(
            shop=self.shop,
            name="Super Deluxe Premium Detailing Treatment",
            duration=30,
        )
        customer = make_customer()
        customer.first_name = "Bartholomew"
        customer.last_name = "Quibbleton"
        customer.save(update_fields=["first_name", "last_name"])
        _make_reservation(
            shop=self.shop,
            service=long_service,
            resource=self.station1,
            start=_aware(self.target, 10, 0),
            end=_aware(self.target, 10, 30),
            customer=customer,
        )
        result = station_day_availability(self.shop, self.target)
        seg = next(s for s in result["stations"][0]["segments"] if s["kind"] == "reserved")
        self.assertLessEqual(len(seg["label"]), 32)


class StationsAvailabilityEndpointTests(TestCase):
    """HTTP-level: auth/forbidden + the ?date param parsing."""

    def setUp(self):
        self.client = APIClient()
        self.owner = make_shop_owner()
        self.shop = make_shop(owner=self.owner, resources=1)
        WeekdayHours.objects.filter(shop=self.shop).update(
            is_closed=False, open_time=time(9, 0), close_time=time(17, 0)
        )
        make_service(shop=self.shop, name="Cut", duration=30)
        self.url = f"/api/shops/{self.shop.id}/stations-availability/"

    def test_unauthenticated_request_is_denied(self):
        response = self.client.get(self.url)
        # IsShopOwner -> 401 for anonymous (JWT/Auth not provided).
        self.assertIn(response.status_code, (401, 403))

    def test_other_owner_cannot_view_someone_elses_shop(self):
        other = make_shop_owner()
        self.client.force_authenticate(other)
        response = self.client.get(self.url)
        # ModelViewSet's `get_object` runs against the shop's default
        # queryset, which is everything — so the explicit owner check
        # inside the action is what returns 403.
        self.assertEqual(response.status_code, 403)

    def test_default_date_is_today(self):
        self.client.force_authenticate(self.owner)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["date"], timezone.localdate().isoformat())

    def test_explicit_date_param_is_honoured(self):
        self.client.force_authenticate(self.owner)
        target = _next_weekday(2)
        response = self.client.get(self.url, {"date": target.isoformat()})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["date"], target.isoformat())

    def test_invalid_date_param_returns_400(self):
        self.client.force_authenticate(self.owner)
        response = self.client.get(self.url, {"date": "not-a-date"})
        self.assertEqual(response.status_code, 400)
