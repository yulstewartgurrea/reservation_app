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


class ServiceDiscoverRatingAndOrderingTests(TestCase):
    """The redesigned /services browse page reads `shop_avg_rating` +
    `shop_reviews_count` off each card and lets the user re-sort. The values
    come straight from the service's parent shop (no service-level reviews).
    """

    def setUp(self):
        self.client = APIClient()

    def _attach_review(self, shop, *, rating, customer=None):
        """Create a Review on a fresh completed reservation for `shop`.

        Mirrors the helper used in apps/shops/tests/test_browse_extensions.py
        — we bypass availability/allocation here because we only need a
        Review row with a fixed `rating` and `shop` for the aggregation to
        observe.
        """
        from datetime import timedelta

        from django.utils import timezone

        from apps.core.test_factories import make_customer, make_resource
        from apps.reservations.models import Reservation
        from apps.reviews.models import Review

        customer = customer or make_customer()
        service = shop.services.filter(is_active=True).first() or make_service(shop=shop)
        resource = shop.resources.first() or make_resource(shop=shop)
        # Stagger start times so unique reservation rows don't collide on the
        # OneToOne to Review.
        offset = Review.objects.filter(shop=shop).count() + 1
        start = timezone.now() - timedelta(days=offset)
        reservation = Reservation.objects.create(
            customer=customer,
            shop=shop,
            service=service,
            resource=resource,
            start_at=start,
            end_at=start + timedelta(minutes=service.duration_minutes),
            status=Reservation.Status.COMPLETED,
            source=Reservation.Source.ONLINE,
            unit_price=service.price,
            total_price=service.price,
        )
        return Review.objects.create(
            customer=customer, shop=shop, reservation=reservation, rating=rating
        )

    def test_response_includes_rating_and_count_fields(self):
        """A shop with 3 reviews avg 4.5 -> 4.5/3 on each of its services;
        a shop with no reviews -> null / 0."""
        rated = make_shop(name="Rated Shop", city="Cebu")
        unrated = make_shop(name="Unrated Shop", city="Cebu")
        s_rated = make_service(shop=rated, name="Cut")
        s_unrated = make_service(shop=unrated, name="Shave")

        # 4 + 5 + 4 = 13 / 3 = 4.333... -> rounds to 4.3 on 1 decimal place
        self._attach_review(rated, rating=4)
        self._attach_review(rated, rating=5)
        self._attach_review(rated, rating=4)

        response = self.client.get("/api/services/discover/")
        self.assertEqual(response.status_code, 200, response.content)
        by_id = {row["id"]: row for row in response.json()["results"]}

        rated_row = by_id[s_rated.id]
        self.assertAlmostEqual(rated_row["shop_avg_rating"], 4.3, places=1)
        self.assertEqual(rated_row["shop_reviews_count"], 3)

        unrated_row = by_id[s_unrated.id]
        self.assertIsNone(unrated_row["shop_avg_rating"])
        self.assertEqual(unrated_row["shop_reviews_count"], 0)

    def test_rounding_is_one_decimal(self):
        """avg 4.5 (3 + 5 + 5 + 5 = 18 / 4) must round-trip exactly."""
        shop = make_shop(name="Half Shop")
        service = make_service(shop=shop, name="Service")
        # 3, 5, 5, 5 -> avg = 4.5
        for r in (3, 5, 5, 5):
            self._attach_review(shop, rating=r)

        response = self.client.get("/api/services/discover/")
        row = next(
            r for r in response.json()["results"] if r["id"] == service.id
        )
        self.assertEqual(row["shop_avg_rating"], 4.5)
        self.assertEqual(row["shop_reviews_count"], 4)

    def test_ordering_by_highest_rated_first_no_reviews_last(self):
        # Three shops: 5-star, 3-star, no reviews. Postgres puts NULL last on
        # DESC by default, so the no-review row must appear at the end.
        five = make_shop(name="Five Star")
        three = make_shop(name="Three Star")
        zero = make_shop(name="Zero Reviews")
        s_five = make_service(shop=five, name="A")
        s_three = make_service(shop=three, name="B")
        s_zero = make_service(shop=zero, name="C")

        self._attach_review(five, rating=5)
        self._attach_review(three, rating=3)

        response = self.client.get(
            "/api/services/discover/?ordering=-shop_avg_rating"
        )
        self.assertEqual(response.status_code, 200, response.content)
        ids = [r["id"] for r in response.json()["results"]]
        self.assertEqual(ids, [s_five.id, s_three.id, s_zero.id])

    def test_ordering_by_most_reviewed_first(self):
        many = make_shop(name="Many Reviews")
        few = make_shop(name="Few Reviews")
        none_shop = make_shop(name="No Reviews")
        s_many = make_service(shop=many, name="A")
        s_few = make_service(shop=few, name="B")
        s_none = make_service(shop=none_shop, name="C")

        for _ in range(4):
            self._attach_review(many, rating=4)
        self._attach_review(few, rating=5)

        response = self.client.get(
            "/api/services/discover/?ordering=-shop_reviews_count"
        )
        self.assertEqual(response.status_code, 200, response.content)
        ids = [r["id"] for r in response.json()["results"]]
        self.assertEqual(ids, [s_many.id, s_few.id, s_none.id])

    def test_ordering_by_name_descending(self):
        shop = make_shop(name="Sort Shop")
        a = make_service(shop=shop, name="Alpha")
        b = make_service(shop=shop, name="Bravo")
        c = make_service(shop=shop, name="Charlie")

        response = self.client.get("/api/services/discover/?ordering=-name")
        self.assertEqual(response.status_code, 200, response.content)
        ids = [r["id"] for r in response.json()["results"]]
        self.assertEqual(ids, [c.id, b.id, a.id])

    def test_default_ordering_is_name_ascending(self):
        shop = make_shop(name="Default Shop")
        a = make_service(shop=shop, name="Alpha")
        b = make_service(shop=shop, name="Bravo")
        c = make_service(shop=shop, name="Charlie")

        response = self.client.get("/api/services/discover/")
        self.assertEqual(response.status_code, 200, response.content)
        ids = [r["id"] for r in response.json()["results"]]
        self.assertEqual(ids, [a.id, b.id, c.id])

    def test_filters_combine_with_ordering(self):
        """`?q=` + `?city=` + `?ordering=-shop_avg_rating` cooperate."""
        cebu_five = make_shop(name="Cebu Top", city="Cebu")
        cebu_three = make_shop(name="Cebu Mid", city="Cebu")
        # Same city, but the name doesn't match the search -> excluded.
        cebu_other = make_shop(name="Cebu Off", city="Cebu")
        # Right name, wrong city -> excluded.
        davao = make_shop(name="Davao Top", city="Davao")

        match_top = make_service(shop=cebu_five, name="Massage Royale")
        match_mid = make_service(shop=cebu_three, name="Massage Lite")
        make_service(shop=cebu_other, name="Haircut Only")
        make_service(shop=davao, name="Massage Davao")

        self._attach_review(cebu_five, rating=5)
        self._attach_review(cebu_three, rating=3)

        response = self.client.get(
            "/api/services/discover/?q=massage&city=Cebu&ordering=-shop_avg_rating"
        )
        self.assertEqual(response.status_code, 200, response.content)
        ids = [r["id"] for r in response.json()["results"]]
        self.assertEqual(ids, [match_top.id, match_mid.id])

    def test_invalid_ordering_falls_back_to_default(self):
        shop = make_shop(name="Fallback Shop")
        a = make_service(shop=shop, name="Alpha")
        b = make_service(shop=shop, name="Bravo")

        response = self.client.get("/api/services/discover/?ordering=bogus")
        self.assertEqual(response.status_code, 200, response.content)
        ids = [r["id"] for r in response.json()["results"]]
        # Default = name ascending.
        self.assertEqual(ids, [a.id, b.id])


class ServiceDiscoverDateGuestsFilterTests(TestCase):
    """`?booking_date=YYYY-MM-DD` and `?guests=N` restrict discover results to
    services whose shop is open on the date AND that can accept the party size.
    Mirrors the `/shops/` browse contract so the two pages feel symmetric."""

    def setUp(self):
        from datetime import timedelta

        from django.utils import timezone

        self.client = APIClient()
        # A future weekday avoids `compute_slots`' "skip past times" guard.
        self.target_date = timezone.localdate() + timedelta(days=7)

    def _isodate(self, d):
        return d.isoformat()

    def test_includes_service_on_open_day(self):
        shop = make_shop(name="Open Today")
        make_service(shop=shop, name="Open Cut")
        response = self.client.get(
            "/api/services/discover/",
            {"booking_date": self._isodate(self.target_date)},
        )
        self.assertEqual(response.status_code, 200)
        names = {r["name"] for r in response.json()["results"]}
        self.assertIn("Open Cut", names)

    def test_excludes_service_when_shop_closed_all_week(self):
        closed = make_shop(name="Closed Shop", open_all_week=False)
        make_service(shop=closed, name="Phantom Cut")
        response = self.client.get(
            "/api/services/discover/",
            {"booking_date": self._isodate(self.target_date)},
        )
        names = {r["name"] for r in response.json()["results"]}
        self.assertNotIn("Phantom Cut", names)

    def test_excludes_service_when_shop_has_no_resources(self):
        shop = make_shop(name="No Stations", resources=0)
        make_service(shop=shop, name="Cannot Book")
        response = self.client.get(
            "/api/services/discover/",
            {"booking_date": self._isodate(self.target_date)},
        )
        names = {r["name"] for r in response.json()["results"]}
        self.assertNotIn("Cannot Book", names)

    def test_guests_filters_out_low_capacity_services(self):
        shop = make_shop(name="Capacity Test")
        small = make_service(shop=shop, name="Solo Only")
        big = make_service(shop=shop, name="Group OK")
        # `max_quantity` defaults to 1; bump `big` so guests=3 passes the
        # capacity check.
        big.max_quantity = 5
        big.save(update_fields=["max_quantity"])

        response = self.client.get(
            "/api/services/discover/",
            {
                "booking_date": self._isodate(self.target_date),
                "guests": "3",
            },
        )
        names = {r["name"] for r in response.json()["results"]}
        self.assertIn("Group OK", names)
        self.assertNotIn("Solo Only", names)
        # Sanity: ids should match too.
        ids = {r["id"] for r in response.json()["results"]}
        self.assertIn(big.id, ids)
        self.assertNotIn(small.id, ids)

    def test_past_booking_date_returns_empty(self):
        from datetime import timedelta

        from django.utils import timezone

        shop = make_shop(name="Time Traveler")
        make_service(shop=shop, name="Throwback")
        past = timezone.localdate() - timedelta(days=1)
        response = self.client.get(
            "/api/services/discover/", {"booking_date": self._isodate(past)}
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], 0)

    def test_invalid_booking_date_is_ignored(self):
        shop = make_shop(name="Always Visible")
        make_service(shop=shop, name="Stays Listed")
        response = self.client.get(
            "/api/services/discover/", {"booking_date": "not-a-date"}
        )
        self.assertEqual(response.status_code, 200)
        names = {r["name"] for r in response.json()["results"]}
        self.assertIn("Stays Listed", names)

    def test_invalid_guests_value_is_ignored(self):
        shop = make_shop(name="Guests Test")
        make_service(shop=shop, name="Solo Service")
        response = self.client.get(
            "/api/services/discover/",
            {
                "booking_date": self._isodate(self.target_date),
                "guests": "bogus",
            },
        )
        # `guests` defaults to 1 on malformed input → a max_quantity=1 service
        # still shows.
        names = {r["name"] for r in response.json()["results"]}
        self.assertIn("Solo Service", names)


class ServiceDiscoverMultiCategoryFilterTests(TestCase):
    """`?category=` now accepts comma-separated ids so the redesigned sidebar
    can check multiple boxes (Home Services + Cleaning, etc.). A single id
    still works for the existing bookmark/test form."""

    def setUp(self):
        from apps.shops.models import Category

        self.client = APIClient()
        # `slug` is unique + non-nullable; specify explicitly so the rows
        # don't collide on an empty default slug.
        self.cat_home, _ = Category.objects.get_or_create(
            slug="home-services", defaults={"name": "Home Services"}
        )
        self.cat_clean, _ = Category.objects.get_or_create(
            slug="cleaning", defaults={"name": "Cleaning"}
        )
        self.cat_repair, _ = Category.objects.get_or_create(
            slug="repair", defaults={"name": "Repair"}
        )

        shop = make_shop(name="Multi Cat Shop")
        self.s_home = make_service(shop=shop, name="Aircon Install")
        self.s_home.category = self.cat_home
        self.s_home.save(update_fields=["category"])
        self.s_clean = make_service(shop=shop, name="Deep Clean")
        self.s_clean.category = self.cat_clean
        self.s_clean.save(update_fields=["category"])
        self.s_repair = make_service(shop=shop, name="Fix It")
        self.s_repair.category = self.cat_repair
        self.s_repair.save(update_fields=["category"])

    def test_single_category_still_works(self):
        response = self.client.get(
            f"/api/services/discover/?category={self.cat_home.id}"
        )
        ids = {r["id"] for r in response.json()["results"]}
        self.assertEqual(ids, {self.s_home.id})

    def test_comma_separated_categories_unions_results(self):
        ids_param = f"{self.cat_home.id},{self.cat_clean.id}"
        response = self.client.get(
            f"/api/services/discover/?category={ids_param}"
        )
        ids = {r["id"] for r in response.json()["results"]}
        self.assertEqual(ids, {self.s_home.id, self.s_clean.id})

    def test_unknown_id_is_silently_dropped(self):
        # 999999 doesn't exist; the real id should still match.
        ids_param = f"{self.cat_home.id},999999"
        response = self.client.get(
            f"/api/services/discover/?category={ids_param}"
        )
        ids = {r["id"] for r in response.json()["results"]}
        self.assertEqual(ids, {self.s_home.id})

    def test_garbage_token_is_ignored(self):
        response = self.client.get(
            f"/api/services/discover/?category={self.cat_clean.id},abc"
        )
        ids = {r["id"] for r in response.json()["results"]}
        self.assertEqual(ids, {self.s_clean.id})


class ServiceDiscoverMinRatingFilterTests(TestCase):
    """`?min_rating=4` keeps only services whose shop's avg rating is >= 4.
    Shops with zero reviews are excluded (NULL avg < threshold)."""

    def setUp(self):
        self.client = APIClient()

    def _attach_review(self, shop, *, rating):
        """Same shape as ServiceDiscoverRatingAndOrderingTests above — kept
        local to keep this test class self-contained."""
        from datetime import timedelta

        from django.utils import timezone

        from apps.core.test_factories import make_customer, make_resource
        from apps.reservations.models import Reservation
        from apps.reviews.models import Review

        customer = make_customer()
        service = shop.services.filter(is_active=True).first() or make_service(shop=shop)
        resource = shop.resources.first() or make_resource(shop=shop)
        offset = Review.objects.filter(shop=shop).count() + 1
        start = timezone.now() - timedelta(days=offset)
        reservation = Reservation.objects.create(
            customer=customer,
            shop=shop,
            service=service,
            resource=resource,
            start_at=start,
            end_at=start + timedelta(minutes=service.duration_minutes),
            status=Reservation.Status.COMPLETED,
            source=Reservation.Source.ONLINE,
            unit_price=service.price,
            total_price=service.price,
        )
        return Review.objects.create(
            customer=customer, shop=shop, reservation=reservation, rating=rating
        )

    def test_includes_shops_at_or_above_threshold(self):
        high = make_shop(name="High")
        low = make_shop(name="Low")
        s_high = make_service(shop=high, name="A")
        s_low = make_service(shop=low, name="B")
        self._attach_review(high, rating=5)
        self._attach_review(high, rating=4)  # avg 4.5
        self._attach_review(low, rating=3)
        self._attach_review(low, rating=3)  # avg 3.0

        response = self.client.get("/api/services/discover/?min_rating=4")
        ids = {r["id"] for r in response.json()["results"]}
        self.assertIn(s_high.id, ids)
        self.assertNotIn(s_low.id, ids)

    def test_excludes_unrated_shops(self):
        rated = make_shop(name="Rated")
        unrated = make_shop(name="Unrated")
        s_rated = make_service(shop=rated, name="A")
        s_unrated = make_service(shop=unrated, name="B")
        self._attach_review(rated, rating=5)

        response = self.client.get("/api/services/discover/?min_rating=4")
        ids = {r["id"] for r in response.json()["results"]}
        self.assertIn(s_rated.id, ids)
        self.assertNotIn(s_unrated.id, ids)

    def test_invalid_min_rating_is_ignored(self):
        shop = make_shop(name="Visible")
        s = make_service(shop=shop, name="A")
        response = self.client.get("/api/services/discover/?min_rating=bogus")
        ids = {r["id"] for r in response.json()["results"]}
        self.assertIn(s.id, ids)


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
