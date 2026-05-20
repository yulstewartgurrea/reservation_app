"""Tests for the ServicePhoto endpoints + cover_photo serializer field +
service list/stats endpoints used by the shop owner dashboard."""

from decimal import Decimal
from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.test_factories import (
    make_admin,
    make_service,
    make_shop,
    make_shop_owner,
)
from apps.services.models import Service, ServicePhoto, ServicePriceHistory
from apps.services.services import update_service


def _fake_image(name: str = "test.png") -> SimpleUploadedFile:
    """Minimal 1x1 PNG for upload tests. Avoids Pillow magic-checking failures."""
    png = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\x00\x01"
        b"\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    return SimpleUploadedFile(name, png, content_type="image/png")


class ServicePhotoEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = make_shop_owner()
        self.shop = make_shop(owner=self.owner)
        self.service = make_service(shop=self.shop)

    def test_owner_can_upload_photo(self):
        self.client.force_authenticate(self.owner)
        response = self.client.post(
            f"/api/services/{self.service.id}/photos/",
            data={"image": _fake_image()},
            format="multipart",
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertTrue(ServicePhoto.objects.filter(service=self.service).exists())

    def test_first_uploaded_photo_is_auto_primary(self):
        """First photo uploaded becomes the cover so the service always has one."""
        self.client.force_authenticate(self.owner)
        self.client.post(
            f"/api/services/{self.service.id}/photos/",
            data={"image": _fake_image("first.png")},
            format="multipart",
        )
        self.assertEqual(
            ServicePhoto.objects.filter(service=self.service, is_primary=True).count(),
            1,
        )
        # Second upload should NOT steal the primary flag.
        self.client.post(
            f"/api/services/{self.service.id}/photos/",
            data={"image": _fake_image("second.png")},
            format="multipart",
        )
        self.assertEqual(
            ServicePhoto.objects.filter(service=self.service, is_primary=True).count(),
            1,
        )

    def test_non_owner_cannot_upload(self):
        outsider = make_shop_owner()
        self.client.force_authenticate(outsider)
        response = self.client.post(
            f"/api/services/{self.service.id}/photos/",
            data={"image": _fake_image()},
            format="multipart",
        )
        self.assertEqual(response.status_code, 403)

    def test_list_photos_is_public(self):
        ServicePhoto.objects.create(service=self.service, image=_fake_image())
        response = self.client.get(f"/api/services/{self.service.id}/photos/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 1)

    def test_owner_can_delete_photo(self):
        photo = ServicePhoto.objects.create(service=self.service, image=_fake_image())
        self.client.force_authenticate(self.owner)
        response = self.client.delete(
            f"/api/services/{self.service.id}/photos/{photo.id}/"
        )
        self.assertEqual(response.status_code, 204)
        self.assertFalse(ServicePhoto.objects.filter(id=photo.id).exists())

    def test_deleting_primary_promotes_next_photo(self):
        """A service should always have a primary photo if it has any photos."""
        primary = ServicePhoto.objects.create(
            service=self.service, image=_fake_image("a.png"), sort_order=0, is_primary=True
        )
        next_up = ServicePhoto.objects.create(
            service=self.service, image=_fake_image("b.png"), sort_order=1
        )
        self.client.force_authenticate(self.owner)
        self.client.delete(f"/api/services/{self.service.id}/photos/{primary.id}/")
        next_up.refresh_from_db()
        self.assertTrue(next_up.is_primary)

    def test_cover_photo_uses_primary(self):
        # b.png is the primary even though a.png has a lower sort_order — that's
        # exactly the case the primary flag exists for.
        ServicePhoto.objects.create(
            service=self.service, image=_fake_image("a.png"), sort_order=0
        )
        ServicePhoto.objects.create(
            service=self.service,
            image=_fake_image("b.png"),
            sort_order=1,
            is_primary=True,
        )
        response = self.client.get(f"/api/services/{self.service.id}/")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIsNotNone(body["cover_photo"])
        # Cover should be b.png — Django may add a suffix to avoid filename
        # collisions, so match the stem rather than the literal name.
        self.assertRegex(body["cover_photo"], r"/services/b[\w]*\.png$")
        self.assertEqual(len(body["gallery"]), 2)

    def test_set_primary_endpoint(self):
        first = ServicePhoto.objects.create(
            service=self.service, image=_fake_image("a.png"), sort_order=0, is_primary=True
        )
        second = ServicePhoto.objects.create(
            service=self.service, image=_fake_image("b.png"), sort_order=1
        )
        self.client.force_authenticate(self.owner)
        response = self.client.post(
            f"/api/services/{self.service.id}/photos/{second.id}/primary/"
        )
        self.assertEqual(response.status_code, 200, response.content)
        first.refresh_from_db()
        second.refresh_from_db()
        self.assertFalse(first.is_primary)
        self.assertTrue(second.is_primary)

    def test_set_primary_endpoint_rejects_non_owner(self):
        photo = ServicePhoto.objects.create(
            service=self.service, image=_fake_image("a.png")
        )
        outsider = make_shop_owner()
        self.client.force_authenticate(outsider)
        response = self.client.post(
            f"/api/services/{self.service.id}/photos/{photo.id}/primary/"
        )
        self.assertEqual(response.status_code, 403)


class ServiceListAndStatsTests(TestCase):
    """The shop owner dashboard hits `/services/?shop=<id>` for the grid and
    `/services/stats/?shop=<id>` for the KPI cards. Both must include inactive
    services so the owner can manage them."""

    def setUp(self):
        self.client = APIClient()
        self.owner = make_shop_owner()
        self.shop = make_shop(owner=self.owner)
        # Two active + one inactive service in the owner's shop
        make_service(shop=self.shop, name="Active A", duration=30, price="100.00")
        make_service(shop=self.shop, name="Active B", duration=60, price="200.00")
        inactive = make_service(
            shop=self.shop, name="Inactive C", duration=90, price="300.00"
        )
        inactive.is_active = False
        inactive.save(update_fields=["is_active"])

    def test_owner_list_includes_inactive_services(self):
        self.client.force_authenticate(self.owner)
        response = self.client.get(f"/api/services/?shop={self.shop.id}")
        self.assertEqual(response.status_code, 200)
        names = [s["name"] for s in response.json()["results"]]
        self.assertIn("Inactive C", names)
        self.assertEqual(len(names), 3)

    def test_public_list_hides_inactive_services(self):
        """Anonymous customer browsing the public catalog should not see inactive rows."""
        response = self.client.get(f"/api/services/?shop={self.shop.id}")
        self.assertEqual(response.status_code, 200)
        names = [s["name"] for s in response.json()["results"]]
        self.assertNotIn("Inactive C", names)
        self.assertEqual(len(names), 2)

    def test_search_filters_by_name(self):
        self.client.force_authenticate(self.owner)
        response = self.client.get(
            f"/api/services/?shop={self.shop.id}&search=Inactive"
        )
        self.assertEqual(response.status_code, 200)
        names = [s["name"] for s in response.json()["results"]]
        self.assertEqual(names, ["Inactive C"])

    def test_list_is_paginated(self):
        # Bulk-create enough rows to exceed the default page size (12) so we
        # can assert `next` is non-null and `results` honors the page boundary.
        Service.objects.bulk_create([
            Service(shop=self.shop, name=f"Bulk {i}", duration_minutes=15, price="10.00")
            for i in range(25)
        ])
        self.client.force_authenticate(self.owner)
        response = self.client.get(f"/api/services/?shop={self.shop.id}")
        body = response.json()
        self.assertIn("count", body)
        self.assertIn("results", body)
        self.assertIsNotNone(body["next"])
        self.assertLessEqual(len(body["results"]), 12)

    def test_page_size_query_param_overrides_default(self):
        """The customer shop page asks for 8 cards per page via `?page_size=8`."""
        Service.objects.bulk_create([
            Service(shop=self.shop, name=f"Bulk {i}", duration_minutes=15, price="10.00")
            for i in range(15)
        ])
        response = self.client.get(f"/api/services/?shop={self.shop.id}&page_size=8")
        body = response.json()
        self.assertEqual(len(body["results"]), 8)
        self.assertIsNotNone(body["next"])

    def test_page_size_is_capped(self):
        """`?page_size=` cannot be used to slurp the whole table."""
        Service.objects.bulk_create([
            Service(shop=self.shop, name=f"Bulk {i}", duration_minutes=15, price="10.00")
            for i in range(60)
        ])
        response = self.client.get(f"/api/services/?shop={self.shop.id}&page_size=999")
        body = response.json()
        self.assertLessEqual(len(body["results"]), 50)

    def test_ordering_by_price_ascending(self):
        # Two services already exist: "Active A" @ 100.00 and "Active B" @ 200.00.
        make_service(shop=self.shop, name="Pricey", duration=30, price="500.00")
        response = self.client.get(
            f"/api/services/?shop={self.shop.id}&ordering=price"
        )
        body = response.json()
        names = [s["name"] for s in body["results"]]
        # Ascending: 100, 200, 500 → "Active A", "Active B", "Pricey"
        self.assertEqual(names[0], "Active A")
        self.assertEqual(names[1], "Active B")
        self.assertEqual(names[2], "Pricey")

    def test_ordering_by_price_descending(self):
        make_service(shop=self.shop, name="Pricey", duration=30, price="500.00")
        response = self.client.get(
            f"/api/services/?shop={self.shop.id}&ordering=-price"
        )
        body = response.json()
        names = [s["name"] for s in body["results"]]
        self.assertEqual(names[0], "Pricey")

    def test_stats_endpoint_aggregates_owner_shop(self):
        self.client.force_authenticate(self.owner)
        response = self.client.get(f"/api/services/stats/?shop={self.shop.id}")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["total"], 3)
        self.assertEqual(body["active"], 2)
        self.assertEqual(body["inactive"], 1)
        # avg of 30, 60, 90 = 60
        self.assertEqual(body["avg_duration"], 60)

    def test_stats_endpoint_rejects_non_owner(self):
        outsider = make_shop_owner()
        self.client.force_authenticate(outsider)
        response = self.client.get(f"/api/services/stats/?shop={self.shop.id}")
        self.assertEqual(response.status_code, 403)

    def test_discover_is_paginated(self):
        """Cross-shop discover now returns the paginated envelope so the frontend can page through."""
        Service.objects.bulk_create([
            Service(shop=self.shop, name=f"Discoverable {i}", duration_minutes=15, price="10.00")
            for i in range(20)
        ])
        response = self.client.get("/api/services/discover/")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("count", body)
        self.assertIn("results", body)
        self.assertIsNotNone(body["next"])
        self.assertLessEqual(len(body["results"]), 12)

    def test_discover_filters_by_query(self):
        make_service(shop=self.shop, name="Deep tissue massage", duration=60, price="700.00")
        response = self.client.get("/api/services/discover/?q=massage")
        self.assertEqual(response.status_code, 200)
        names = [s["name"] for s in response.json()["results"]]
        self.assertEqual(names, ["Deep tissue massage"])


class ServicePriceHistoryTests(TestCase):
    """update_service records a ServicePriceHistory row only when the
    persisted price actually changes."""

    def setUp(self):
        self.owner = make_shop_owner()
        self.shop = make_shop(owner=self.owner)
        self.service = make_service(shop=self.shop, price="500.00")

    def test_price_change_records_one_history_row(self):
        update_service(
            service=self.service,
            validated_data={"price": Decimal("750.00")},
            changed_by=self.owner,
        )
        rows = ServicePriceHistory.objects.filter(service=self.service)
        self.assertEqual(rows.count(), 1)
        row = rows.first()
        self.assertEqual(row.old_price, Decimal("500.00"))
        self.assertEqual(row.new_price, Decimal("750.00"))
        self.assertEqual(row.changed_by, self.owner)

    def test_update_without_price_change_records_nothing(self):
        update_service(
            service=self.service,
            validated_data={"name": "Renamed", "price": Decimal("500.00")},
            changed_by=self.owner,
        )
        self.assertFalse(
            ServicePriceHistory.objects.filter(service=self.service).exists()
        )
        self.service.refresh_from_db()
        self.assertEqual(self.service.name, "Renamed")

    def test_patch_endpoint_routes_through_service_layer(self):
        client = APIClient()
        client.force_authenticate(self.owner)
        response = client.patch(
            f"/api/services/{self.service.id}/",
            {"price": "900.00"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(
            ServicePriceHistory.objects.filter(service=self.service).count(), 1
        )


class ServicePriceHistoryPermissionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner_a = make_shop_owner()
        self.shop_a = make_shop(owner=self.owner_a)
        self.service_a = make_service(shop=self.shop_a, price="500.00")
        update_service(
            service=self.service_a,
            validated_data={"price": Decimal("600.00")},
            changed_by=self.owner_a,
        )

        self.owner_b = make_shop_owner()

    def _url(self):
        return f"/api/services/{self.service_a.id}/price-history/"

    def test_owner_can_view_own_service_history(self):
        self.client.force_authenticate(self.owner_a)
        response = self.client.get(self._url())
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(len(response.json()), 1)

    def test_other_owner_cannot_view_history(self):
        self.client.force_authenticate(self.owner_b)
        response = self.client.get(self._url())
        self.assertEqual(response.status_code, 403)

    def test_admin_can_view_any_history(self):
        self.client.force_authenticate(make_admin())
        response = self.client.get(self._url())
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(len(response.json()), 1)
