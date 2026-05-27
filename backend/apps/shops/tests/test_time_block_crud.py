"""TimeBlock CRUD endpoint tests.

Backs the shop-owner Stations dashboard where the owner can add/remove
TimeBlocks (breaks, maintenance, vacations) from the timeline UI.
"""

from datetime import datetime, time, timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.test_factories import (
    make_resource,
    make_shop,
    make_shop_owner,
)
from apps.shops.models import TimeBlock


def _rows(response):
    """Return the list of rows whether the endpoint is paginated or not.

    The DRF default pagination wraps responses in `{count, next, previous,
    results}`; this helper makes the assertions agnostic to that.
    """
    payload = response.json()
    return payload["results"] if isinstance(payload, dict) and "results" in payload else payload


def _future_dt(hour, minute=0, days_ahead=1):
    tz = timezone.get_current_timezone()
    target = timezone.localdate() + timedelta(days=days_ahead)
    return timezone.make_aware(datetime.combine(target, time(hour, minute)), tz)


class TimeBlockCrudTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = make_shop_owner()
        self.shop = make_shop(owner=self.owner, resources=1)
        self.resource = self.shop.resources.first()
        self.client.force_authenticate(self.owner)

    # ------------------------------------------------------------------
    # Create
    # ------------------------------------------------------------------

    def test_owner_can_create_resource_scoped_block(self):
        start = _future_dt(10, 0)
        end = _future_dt(11, 0)
        response = self.client.post(
            "/api/shops/time-blocks/",
            {
                "shop": self.shop.id,
                "resource": self.resource.id,
                "start_at": start.isoformat(),
                "end_at": end.isoformat(),
                "reason": "Maintenance",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        block_id = response.json()["id"]
        self.assertTrue(TimeBlock.objects.filter(pk=block_id, shop=self.shop).exists())

    def test_owner_can_create_shop_wide_block(self):
        start = _future_dt(12, 0)
        end = _future_dt(13, 0)
        response = self.client.post(
            "/api/shops/time-blocks/",
            {
                "shop": self.shop.id,
                "start_at": start.isoformat(),
                "end_at": end.isoformat(),
                "reason": "Lunch",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        block = TimeBlock.objects.get(pk=response.json()["id"])
        self.assertIsNone(block.resource_id)
        self.assertIsNone(block.staff_id)

    # ------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------

    def test_end_before_or_equal_start_returns_400(self):
        start = _future_dt(10, 0)
        response = self.client.post(
            "/api/shops/time-blocks/",
            {
                "shop": self.shop.id,
                "start_at": start.isoformat(),
                "end_at": start.isoformat(),
                "reason": "Bad",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("end_at", response.json())

    def test_resource_belonging_to_other_shop_rejected(self):
        other_shop = make_shop(owner=self.owner, resources=1)
        other_resource = other_shop.resources.first()
        response = self.client.post(
            "/api/shops/time-blocks/",
            {
                "shop": self.shop.id,
                "resource": other_resource.id,
                "start_at": _future_dt(10, 0).isoformat(),
                "end_at": _future_dt(11, 0).isoformat(),
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    # ------------------------------------------------------------------
    # Read / list / delete
    # ------------------------------------------------------------------

    def test_list_returns_only_owners_blocks(self):
        TimeBlock.objects.create(
            shop=self.shop,
            resource=self.resource,
            start_at=_future_dt(10, 0),
            end_at=_future_dt(11, 0),
            reason="Mine",
        )
        # Another owner's block must not leak.
        other_owner = make_shop_owner()
        other_shop = make_shop(owner=other_owner, resources=1)
        TimeBlock.objects.create(
            shop=other_shop,
            resource=other_shop.resources.first(),
            start_at=_future_dt(10, 0),
            end_at=_future_dt(11, 0),
            reason="Theirs",
        )
        response = self.client.get("/api/shops/time-blocks/")
        self.assertEqual(response.status_code, 200)
        reasons = {row["reason"] for row in _rows(response)}
        self.assertEqual(reasons, {"Mine"})

    def test_filter_by_shop_and_date_range(self):
        # In-range
        TimeBlock.objects.create(
            shop=self.shop,
            resource=self.resource,
            start_at=_future_dt(10, 0, days_ahead=1),
            end_at=_future_dt(11, 0, days_ahead=1),
            reason="Soon",
        )
        # Out of range (a week out)
        TimeBlock.objects.create(
            shop=self.shop,
            resource=self.resource,
            start_at=_future_dt(10, 0, days_ahead=7),
            end_at=_future_dt(11, 0, days_ahead=7),
            reason="Later",
        )
        target_date = (timezone.localdate() + timedelta(days=1)).isoformat()
        response = self.client.get(
            "/api/shops/time-blocks/",
            {"shop": self.shop.id, "from": target_date, "to": target_date},
        )
        self.assertEqual(response.status_code, 200)
        reasons = {row["reason"] for row in _rows(response)}
        self.assertEqual(reasons, {"Soon"})

    def test_owner_can_delete_block(self):
        block = TimeBlock.objects.create(
            shop=self.shop,
            resource=self.resource,
            start_at=_future_dt(10, 0),
            end_at=_future_dt(11, 0),
            reason="Bye",
        )
        response = self.client.delete(f"/api/shops/time-blocks/{block.id}/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(TimeBlock.objects.filter(pk=block.id).exists())

    # ------------------------------------------------------------------
    # Permissions
    # ------------------------------------------------------------------

    def test_non_owner_cannot_create_on_someone_elses_shop(self):
        intruder = make_shop_owner()
        # Intruder also owns a different shop; without that they wouldn't
        # pass IsShopOwner. The key check is that they can't create a block
        # against a shop they don't own.
        make_shop(owner=intruder, resources=1)
        self.client.force_authenticate(intruder)
        response = self.client.post(
            "/api/shops/time-blocks/",
            {
                "shop": self.shop.id,
                "resource": self.resource.id,
                "start_at": _future_dt(10, 0).isoformat(),
                "end_at": _future_dt(11, 0).isoformat(),
            },
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_unauthenticated_request_is_denied(self):
        self.client.force_authenticate(user=None)
        response = self.client.get("/api/shops/time-blocks/")
        self.assertIn(response.status_code, (401, 403))
