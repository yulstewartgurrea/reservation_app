"""Shop hours API and availability calculation under overrides."""

from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.reservations.availability import compute_slots
from apps.services.models import Service
from apps.shops.models import HoursOverride, Shop, WeekdayHours

User = get_user_model()


def _make_shop(owner) -> Shop:
    shop = Shop.objects.create(
        owner=owner,
        name="Hours Shop",
        address_line="1",
        city="Cebu",
        country="PH",
        status=Shop.Status.ACTIVE,
    )
    for wd in range(7):
        WeekdayHours.objects.create(
            shop=shop,
            weekday=wd,
            is_closed=False,
            open_time=time(9, 0),
            close_time=time(17, 0),
        )
    return shop


def _next_weekday(target_weekday: int = 0) -> date:
    today = timezone.localdate()
    delta = (target_weekday - today.weekday()) % 7 or 7
    return today + timedelta(days=delta)


class ShopHoursAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = User.objects.create_user(
            username="owner",
            email="o@example.com",
            password="x",
            role=User.Role.SHOP_OWNER,
        )
        self.shop = _make_shop(self.owner)

    def test_owner_can_update_hours(self):
        self.client.force_authenticate(self.owner)
        response = self.client.put(
            f"/api/shops/{self.shop.id}/hours/",
            data=[
                {"weekday": i, "is_closed": False, "open_time": "10:00", "close_time": "18:00"}
                for i in range(7)
            ],
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        rows = WeekdayHours.objects.filter(shop=self.shop).order_by("weekday")
        self.assertEqual(rows.count(), 7)
        self.assertEqual(rows.first().open_time, time(10, 0))

    def test_non_owner_cannot_update_hours(self):
        outsider = User.objects.create_user(
            username="x",
            email="x@example.com",
            password="x",
            role=User.Role.SHOP_OWNER,
        )
        self.client.force_authenticate(outsider)
        response = self.client.put(
            f"/api/shops/{self.shop.id}/hours/",
            data=[{"weekday": 0, "is_closed": False, "open_time": "10:00", "close_time": "18:00"}],
            format="json",
        )
        self.assertEqual(response.status_code, 403)


class AvailabilityWithOverridesTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="o", email="o@e.com", password="x", role=User.Role.SHOP_OWNER
        )
        self.shop = _make_shop(self.owner)
        self.service = Service.objects.create(
            shop=self.shop, name="Cut", duration_minutes=30, price=Decimal("100")
        )

    def test_override_marking_day_closed_yields_no_slots(self):
        target = _next_weekday(0)  # next Monday
        HoursOverride.objects.create(shop=self.shop, date=target, is_closed=True)
        slots = compute_slots(self.shop, self.service, None, target)
        self.assertEqual(slots, [])

    def test_override_with_narrower_hours_limits_slots(self):
        target = _next_weekday(0)
        HoursOverride.objects.create(
            shop=self.shop,
            date=target,
            is_closed=False,
            open_time=time(9, 0),
            close_time=time(10, 0),
        )
        slots = compute_slots(self.shop, self.service, None, target)
        for slot in slots:
            self.assertLess(slot.start_at.time(), time(10, 0))
            self.assertGreaterEqual(slot.start_at.time(), time(9, 0))

    def test_no_slots_in_the_past(self):
        slots = compute_slots(self.shop, self.service, None, timezone.localdate() - timedelta(days=1))
        self.assertEqual(slots, [])
