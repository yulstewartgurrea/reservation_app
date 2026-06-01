"""End-to-end integration tests for the shop-owner use cases (§9.1 of app_ideas.md).

Each test maps to a use case in the spec. Test name = the use case it verifies.
"""

from datetime import time

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.core.test_factories import (
    make_customer,
    make_service,
    make_shop,
    make_shop_owner,
    make_staff,
)
from apps.shops.models import HoursOverride, Shop, ShopPhoto, Staff, WeekdayHours

User = get_user_model()


class ShopOwnerAccountTests(TestCase):
    """§9.1 Account & onboarding."""

    def setUp(self):
        self.client = APIClient()

    def test_register_as_shop_owner(self):
        response = self.client.post(
            "/api/auth/register/",
            {
                "email": "owner@example.com",
                "confirm_email": "owner@example.com",
                "password": "Strong-pw-9",
                "confirm_password": "Strong-pw-9",
                "role": "shop_owner",
                "first_name": "Olivia",
                "last_name": "Owner",
                "phone": "+63-917-000-0001",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(User.objects.get(email="owner@example.com").role, "shop_owner")

    def test_login_returns_jwt_pair(self):
        owner = make_shop_owner(email="login@example.com")
        response = self.client.post(
            "/api/auth/login/",
            {"email": owner.email, "password": "testpw1234"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("access", data)
        self.assertIn("refresh", data)

    def test_me_endpoint_returns_role(self):
        owner = make_shop_owner()
        self.client.force_authenticate(owner)
        response = self.client.get("/api/auth/me/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["role"], "shop_owner")


class MultiShopOwnershipTests(TestCase):
    """§9.1 Multi-shop management."""

    def setUp(self):
        self.client = APIClient()
        self.owner = make_shop_owner()
        self.client.force_authenticate(self.owner)

    def test_create_shop_seeds_default_hours(self):
        response = self.client.post(
            "/api/shops/",
            {
                "name": "Brand New Shop",
                "address_line": "123 Test",
                "city": "Cebu",
                "country": "PH",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        shop_id = response.json()["id"]
        # Should auto-create 7 closed-by-default weekday rows
        self.assertEqual(WeekdayHours.objects.filter(shop_id=shop_id).count(), 7)

    def test_create_shop_starts_pending(self):
        response = self.client.post(
            "/api/shops/",
            {"name": "S", "address_line": "1", "city": "Cebu"},
            format="json",
        )
        self.assertEqual(response.json()["status"], "pending")

    def test_owner_can_publish_then_pause_shop(self):
        shop = make_shop(owner=self.owner, status=Shop.Status.PENDING)
        published = self.client.post(f"/api/shops/{shop.id}/publish/")
        self.assertEqual(published.status_code, 200)
        self.assertEqual(published.json()["status"], "active")

        paused = self.client.post(f"/api/shops/{shop.id}/pause/")
        self.assertEqual(paused.status_code, 200)
        self.assertEqual(paused.json()["status"], "paused")

    def test_only_owner_can_publish(self):
        shop = make_shop()  # owned by a different shop_owner
        response = self.client.post(f"/api/shops/{shop.id}/publish/")
        self.assertEqual(response.status_code, 403)

    def test_mine_lists_only_owners_shops(self):
        mine = make_shop(owner=self.owner, name="Mine")
        make_shop(name="Someone Else's")  # different owner
        response = self.client.get("/api/shops/mine/")
        self.assertEqual(response.status_code, 200)
        ids = {row["id"] for row in response.json()["results"]}
        self.assertIn(mine.id, ids)
        self.assertEqual(len(ids), 1)

    def test_owner_can_edit_shop(self):
        shop = make_shop(owner=self.owner, name="Old Name")
        response = self.client.patch(
            f"/api/shops/{shop.id}/",
            {"name": "New Name", "phone": "+63-917-000-0002"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        shop.refresh_from_db()
        self.assertEqual(shop.name, "New Name")

    def test_owner_can_delete_shop(self):
        shop = make_shop(owner=self.owner)
        response = self.client.delete(f"/api/shops/{shop.id}/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Shop.objects.filter(pk=shop.id).exists())

    def test_mine_includes_cover_photo_field(self):
        """The dashboard card grid needs cover_photo (null when no photos uploaded)."""
        make_shop(owner=self.owner, name="Mine")
        response = self.client.get("/api/shops/mine/")
        self.assertEqual(response.status_code, 200)
        rows = response.json()["results"]
        self.assertEqual(len(rows), 1)
        self.assertIn("cover_photo", rows[0])
        self.assertIsNone(rows[0]["cover_photo"])

    def test_photo_list_returns_absolute_image_urls(self):
        """The photos page renders <img src> directly, so URLs must be absolute
        — otherwise the browser resolves them against the frontend origin and 404s."""
        shop = make_shop(owner=self.owner)
        ShopPhoto.objects.create(shop=shop, image="shops/cover.png", sort_order=0)
        response = self.client.get(f"/api/shops/{shop.id}/photos/")
        self.assertEqual(response.status_code, 200)
        rows = response.json()
        self.assertEqual(len(rows), 1)
        self.assertTrue(rows[0]["image"].startswith("http"), rows[0]["image"])

    def test_set_cover_photo_promotes_target_to_sort_order_zero(self):
        """The cover endpoint moves the chosen photo to the front and renumbers the rest."""
        shop = make_shop(owner=self.owner)
        a = ShopPhoto.objects.create(shop=shop, image="shops/a.png", sort_order=0)
        b = ShopPhoto.objects.create(shop=shop, image="shops/b.png", sort_order=1)
        c = ShopPhoto.objects.create(shop=shop, image="shops/c.png", sort_order=2)
        response = self.client.post(f"/api/shops/{shop.id}/photos/{c.id}/cover/")
        self.assertEqual(response.status_code, 200, response.content)
        a.refresh_from_db()
        b.refresh_from_db()
        c.refresh_from_db()
        self.assertEqual(c.sort_order, 0)
        # a and b keep their relative order but are renumbered 1, 2.
        self.assertEqual(a.sort_order, 1)
        self.assertEqual(b.sort_order, 2)

    def test_set_cover_photo_rejects_non_owner(self):
        shop = make_shop(owner=self.owner)
        photo = ShopPhoto.objects.create(shop=shop, image="shops/x.png", sort_order=0)
        outsider = make_shop_owner()
        client = APIClient()
        client.force_authenticate(outsider)
        response = client.post(f"/api/shops/{shop.id}/photos/{photo.id}/cover/")
        self.assertEqual(response.status_code, 403)


class HoursManagementTests(TestCase):
    """§9.1 Schedule & availability — weekly hours + overrides."""

    def setUp(self):
        self.client = APIClient()
        self.owner = make_shop_owner()
        self.shop = make_shop(owner=self.owner, open_all_week=True)
        self.client.force_authenticate(self.owner)

    def test_get_hours_returns_seven_rows(self):
        response = self.client.get(f"/api/shops/{self.shop.id}/hours/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 7)

    def test_put_hours_updates_all_days(self):
        rows = [
            {"weekday": i, "is_closed": False, "open_time": "10:00", "close_time": "18:00"}
            for i in range(7)
        ]
        response = self.client.put(
            f"/api/shops/{self.shop.id}/hours/", rows, format="json"
        )
        self.assertEqual(response.status_code, 200)
        first = WeekdayHours.objects.get(shop=self.shop, weekday=0)
        self.assertEqual(first.open_time, time(10, 0))
        self.assertEqual(first.close_time, time(18, 0))

    def test_create_override_for_holiday(self):
        response = self.client.post(
            f"/api/shops/{self.shop.id}/overrides/",
            {"date": "2026-12-25", "is_closed": True, "note": "Christmas Day"},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertTrue(
            HoursOverride.objects.filter(shop=self.shop, date="2026-12-25").exists()
        )

    def test_delete_override(self):
        override = HoursOverride.objects.create(
            shop=self.shop, date="2026-12-25", is_closed=True
        )
        response = self.client.delete(
            f"/api/shops/{self.shop.id}/overrides/{override.id}/"
        )
        self.assertEqual(response.status_code, 204)


class ServiceCRUDTests(TestCase):
    """§9.1 Service management."""

    def setUp(self):
        self.client = APIClient()
        self.owner = make_shop_owner()
        self.shop = make_shop(owner=self.owner)
        self.client.force_authenticate(self.owner)

    def test_create_service(self):
        response = self.client.post(
            "/api/services/",
            {
                "shop": self.shop.id,
                "name": "Massage",
                "duration_minutes": 60,
                "buffer_minutes": 15,
                "price": "750.00",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)

    def test_cannot_create_service_for_other_shop(self):
        other_shop = make_shop()
        response = self.client.post(
            "/api/services/",
            {
                "shop": other_shop.id,
                "name": "Spa",
                "duration_minutes": 60,
                "price": "1000.00",
            },
            format="json",
        )
        self.assertIn(response.status_code, (403, 400))

    def test_edit_service(self):
        service = make_service(shop=self.shop)
        response = self.client.patch(
            f"/api/services/{service.id}/",
            {"price": "999.00"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        service.refresh_from_db()
        self.assertEqual(str(service.price), "999.00")

    def test_delete_service(self):
        service = make_service(shop=self.shop)
        response = self.client.delete(f"/api/services/{service.id}/")
        self.assertEqual(response.status_code, 204)


class StaffManagementTests(TestCase):
    """§9.1 Staff management."""

    def setUp(self):
        self.client = APIClient()
        self.owner = make_shop_owner()
        self.shop = make_shop(owner=self.owner)
        self.client.force_authenticate(self.owner)

    def test_add_staff(self):
        response = self.client.post(
            "/api/shops/staff/",
            {"shop": self.shop.id, "name": "Marco", "role": "Stylist", "is_active": True},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)

    def test_deactivate_staff(self):
        staff = Staff.objects.create(shop=self.shop, name="Marco", is_active=True)
        response = self.client.patch(
            f"/api/shops/staff/{staff.id}/", {"is_active": False}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        staff.refresh_from_db()
        self.assertFalse(staff.is_active)

    def test_set_staff_weekly_hours(self):
        staff = Staff.objects.create(shop=self.shop, name="Marco", is_active=True)
        rows = [
            {"weekday": i, "is_off": i in (5, 6), "start_time": "09:00", "end_time": "17:00"}
            for i in range(7)
        ]
        response = self.client.put(
            f"/api/shops/staff/{staff.id}/hours/", rows, format="json"
        )
        self.assertEqual(response.status_code, 200)

    def test_add_staff_with_phone_and_email(self):
        response = self.client.post(
            "/api/shops/staff/",
            {
                "shop": self.shop.id,
                "name": "Maria",
                "role": "Stylist",
                "phone": "+63-917-555-1212",
                "email": "maria@example.com",
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertEqual(body["phone"], "+63-917-555-1212")
        self.assertEqual(body["email"], "maria@example.com")

    def test_staff_stats_aggregates_active_and_inactive(self):
        Staff.objects.create(shop=self.shop, name="A", is_active=True)
        Staff.objects.create(shop=self.shop, name="B", is_active=True)
        Staff.objects.create(shop=self.shop, name="C", is_active=False)
        response = self.client.get(f"/api/shops/staff/stats/?shop={self.shop.id}")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body, {"total": 3, "active": 2, "inactive": 1})

    def test_staff_stats_rejects_non_owner(self):
        outsider = make_shop_owner()
        client = APIClient()
        client.force_authenticate(outsider)
        response = client.get(f"/api/shops/staff/stats/?shop={self.shop.id}")
        self.assertEqual(response.status_code, 403)


class ReservationInboxTests(TestCase):
    """§9.1 Reservation management (shop-owner side)."""

    def setUp(self):
        self.client = APIClient()
        self.owner = make_shop_owner()
        self.shop = make_shop(owner=self.owner)
        self.service = make_service(shop=self.shop)
        self.client.force_authenticate(self.owner)

    def _book_reservation(self):
        from apps.core.test_factories import make_reservation

        return make_reservation(shop=self.shop, service=self.service)

    def test_inbox_lists_only_own_shop_reservations(self):
        own = self._book_reservation()
        # Make a reservation at someone else's shop
        from apps.core.test_factories import make_reservation as mr

        mr()
        response = self.client.get("/api/reservations/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        ids = {row["id"] for row in (data.get("results") or data)}
        self.assertEqual(ids, {own.id})

    def test_owner_can_confirm_reservation(self):
        r = self._book_reservation()
        response = self.client.post(f"/api/reservations/{r.id}/confirm/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "confirmed")

    def test_owner_can_complete_reservation_and_writes_commission(self):
        from apps.reservations.models import CommissionLedger

        r = self._book_reservation()
        self.client.post(f"/api/reservations/{r.id}/confirm/")
        response = self.client.post(f"/api/reservations/{r.id}/complete/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(CommissionLedger.objects.filter(reservation=r).exists())

    def test_owner_can_mark_no_show(self):
        r = self._book_reservation()
        self.client.post(f"/api/reservations/{r.id}/confirm/")
        response = self.client.post(f"/api/reservations/{r.id}/no-show/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "no_show")

    def test_owner_walk_in_creates_confirmed_reservation(self):
        from apps.core.test_factories import future_dt

        response = self.client.post(
            "/api/reservations/walk-in/",
            {
                "shop": self.shop.id,
                "service": self.service.id,
                "start_at": future_dt(2).isoformat(),
                "guest_name": "Walk-In Wendy",
                "guest_phone": "+63917-WALKIN",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["status"], "confirmed")
        self.assertEqual(response.json()["source"], "walk_in")


class ShopAnalyticsTests(TestCase):
    """§9.1 Analytics dashboard."""

    def setUp(self):
        self.client = APIClient()
        self.owner = make_shop_owner()
        self.shop = make_shop(owner=self.owner)
        self.client.force_authenticate(self.owner)

    def test_analytics_endpoint_returns_expected_shape(self):
        response = self.client.get(f"/api/shops/{self.shop.id}/analytics/?days=30")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("totals", body)
        for key in (
            "reservations",
            "completed",
            "no_shows",
            "no_show_rate",
            "revenue",
            "commission",
            "net_after_commission",
        ):
            self.assertIn(key, body["totals"])

    def test_analytics_rejects_non_owner(self):
        other_owner = make_shop_owner()
        self.client.force_authenticate(other_owner)
        response = self.client.get(f"/api/shops/{self.shop.id}/analytics/")
        self.assertEqual(response.status_code, 403)
