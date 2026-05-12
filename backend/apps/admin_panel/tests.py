"""Integration tests for the platform admin endpoints (§9 cross-cutting)."""

from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.test_factories import (
    make_admin,
    make_customer,
    make_shop,
    make_shop_owner,
)
from apps.shops.models import Shop


class AdminPermissionsTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_customer_cannot_access_admin_overview(self):
        self.client.force_authenticate(make_customer())
        response = self.client.get("/api/admin-panel/overview/")
        self.assertEqual(response.status_code, 403)

    def test_shop_owner_cannot_access_admin_overview(self):
        self.client.force_authenticate(make_shop_owner())
        response = self.client.get("/api/admin-panel/overview/")
        self.assertEqual(response.status_code, 403)

    def test_admin_can_access_admin_overview(self):
        self.client.force_authenticate(make_admin())
        response = self.client.get("/api/admin-panel/overview/")
        self.assertEqual(response.status_code, 200)


class AdminApprovalFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = make_admin()
        self.client.force_authenticate(self.admin)

    def test_pending_shops_appears_in_queue(self):
        pending = make_shop(status=Shop.Status.PENDING)
        make_shop(status=Shop.Status.ACTIVE)  # should NOT appear
        response = self.client.get("/api/admin-panel/pending-shops/")
        self.assertEqual(response.status_code, 200)
        ids = {row["id"] for row in response.json()}
        self.assertEqual(ids, {pending.id})

    def test_approve_shop_flips_status(self):
        pending = make_shop(status=Shop.Status.PENDING)
        response = self.client.post(f"/api/admin-panel/shops/{pending.id}/approve/")
        self.assertEqual(response.status_code, 200)
        pending.refresh_from_db()
        self.assertEqual(pending.status, "active")


class AdminOverviewShapeTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(make_admin())

    def test_overview_shape(self):
        response = self.client.get("/api/admin-panel/overview/")
        body = response.json()
        for top in ("shops", "reservations", "commission"):
            self.assertIn(top, body)
        for k in ("total", "active", "pending", "paused"):
            self.assertIn(k, body["shops"])
        for k in ("total", "completed", "no_show"):
            self.assertIn(k, body["reservations"])
        for k in ("total", "settled", "outstanding"):
            self.assertIn(k, body["commission"])

    def test_commission_endpoint(self):
        response = self.client.get("/api/admin-panel/commission/")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("rows", body)
        self.assertIn("by_shop", body)
