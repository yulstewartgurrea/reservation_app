"""End-to-end integration tests for the customer use cases (§9.2 of app_ideas.md)."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.test_factories import (
    future_dt,
    make_customer,
    make_reservation,
    make_service,
    make_shop,
    make_shop_owner,
    make_staff,
)
from apps.reservations.models import Reservation
from apps.reservations.services import transition
from apps.reviews.models import Review
from apps.shops.models import Favorite, Shop

User = get_user_model()


class CustomerAccountTests(TestCase):
    """§9.2 Account & onboarding."""

    def setUp(self):
        self.client = APIClient()

    def test_register_as_customer(self):
        response = self.client.post(
            "/api/auth/register/",
            {
                "email": "newcust@example.com",
                "username": "newcust",
                "password": "strong-pw-9",
                "role": "customer",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)

    def test_register_rejects_invalid_role(self):
        response = self.client.post(
            "/api/auth/register/",
            {
                "email": "x@example.com",
                "username": "x",
                "password": "strong-pw-9",
                "role": "admin",  # not allowed via public register
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)


class DiscoveryTests(TestCase):
    """§9.2 Discovery — list, filter, geo, search."""

    def setUp(self):
        self.client = APIClient()
        owner = make_shop_owner()
        # Create some shops for discovery
        self.cebu_shop = make_shop(owner=owner, name="Cebu Cuts", city="Cebu")
        self.cebu_shop.latitude = Decimal("10.3157")
        self.cebu_shop.longitude = Decimal("123.8854")
        self.cebu_shop.save()

        self.manila_shop = make_shop(owner=owner, name="Manila Trims", city="Manila")
        self.manila_shop.latitude = Decimal("14.5995")
        self.manila_shop.longitude = Decimal("120.9842")
        self.manila_shop.save()

        # An inactive (pending) shop should be excluded from public list
        make_shop(owner=owner, name="Pending Shop", status=Shop.Status.PENDING)

    def test_list_shops_public(self):
        response = self.client.get("/api/shops/")
        self.assertEqual(response.status_code, 200)

    def test_list_excludes_pending_shops(self):
        response = self.client.get("/api/shops/")
        results = response.json().get("results") or response.json()
        names = {row["name"] for row in results}
        self.assertNotIn("Pending Shop", names)

    def test_search_by_name(self):
        response = self.client.get("/api/shops/?search=Cebu")
        results = response.json().get("results") or response.json()
        self.assertTrue(any("Cebu" in row["name"] for row in results))

    def test_filter_by_city(self):
        response = self.client.get("/api/shops/?city=Manila")
        results = response.json().get("results") or response.json()
        for row in results:
            # ShopListSerializer uses `city`
            self.assertEqual(row.get("city"), "Manila")

    def test_nearby_returns_closest_first(self):
        response = self.client.get(
            "/api/shops/nearby/?lat=10.32&lng=123.89&radius_km=10"
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertGreaterEqual(len(data), 1)
        self.assertEqual(data[0]["name"], "Cebu Cuts")
        self.assertIn("distance_km", data[0])

    def test_nearby_validates_inputs(self):
        response = self.client.get("/api/shops/nearby/")
        self.assertEqual(response.status_code, 400)

    def test_cross_shop_service_search(self):
        make_service(shop=self.cebu_shop, name="Haircut")
        make_service(shop=self.manila_shop, name="Haircut")
        response = self.client.get("/api/services/discover/?q=Haircut")
        self.assertEqual(response.status_code, 200)
        results = response.json()
        self.assertEqual(len(results), 2)
        for row in results:
            self.assertIn("shop_name", row)
            self.assertIn("shop_city", row)


class BookingFlowTests(TestCase):
    """§9.2 Booking flow."""

    def setUp(self):
        self.client = APIClient()
        self.customer = make_customer()
        self.shop = make_shop()
        self.service = make_service(shop=self.shop)
        self.client.force_authenticate(self.customer)

    def test_availability_returns_slots(self):
        from datetime import timedelta

        from django.utils import timezone

        target = (timezone.now() + timedelta(days=2)).date().isoformat()
        response = self.client.get(
            "/api/reservations/availability/",
            {"shop": self.shop.id, "service": self.service.id, "date": target},
        )
        self.assertEqual(response.status_code, 200)
        self.assertGreater(len(response.json()), 0)

    def test_book_creates_pending_reservation(self):
        response = self.client.post(
            "/api/reservations/book/",
            {
                "shop": self.shop.id,
                "service": self.service.id,
                "start_at": future_dt(48).isoformat(),
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertEqual(body["status"], "pending")
        self.assertEqual(body["payment_method"], "pay_on_arrival")

    def test_book_with_specific_staff(self):
        staff = make_staff(shop=self.shop)
        response = self.client.post(
            "/api/reservations/book/",
            {
                "shop": self.shop.id,
                "service": self.service.id,
                "staff": staff.id,
                "start_at": future_dt(48).isoformat(),
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["staff"], staff.id)

    def test_book_with_online_payment_method(self):
        response = self.client.post(
            "/api/reservations/book/",
            {
                "shop": self.shop.id,
                "service": self.service.id,
                "start_at": future_dt(48).isoformat(),
                "payment_method": "online",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["payment_method"], "online")

    def test_cannot_book_service_from_different_shop(self):
        other_shop = make_shop()
        response = self.client.post(
            "/api/reservations/book/",
            {
                "shop": self.shop.id,
                "service": make_service(shop=other_shop).id,
                "start_at": future_dt(48).isoformat(),
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)


class MyReservationsTests(TestCase):
    """§9.2 My reservations."""

    def setUp(self):
        self.client = APIClient()
        self.customer = make_customer()
        self.client.force_authenticate(self.customer)

    def test_lists_only_own_reservations(self):
        own = make_reservation(customer=self.customer)
        # Someone else's reservation
        make_reservation()
        response = self.client.get("/api/reservations/")
        results = response.json().get("results") or response.json()
        ids = {r["id"] for r in results}
        self.assertEqual(ids, {own.id})

    def test_customer_can_cancel_own_reservation(self):
        r = make_reservation(customer=self.customer)
        response = self.client.post(f"/api/reservations/{r.id}/cancel/", {"reason": "changed plans"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "cancelled_by_customer")

    def test_customer_can_reschedule_own_reservation(self):
        r = make_reservation(customer=self.customer)
        new_start = future_dt(72).isoformat()
        response = self.client.post(
            f"/api/reservations/{r.id}/reschedule/",
            {"start_at": new_start},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        r.refresh_from_db()
        self.assertEqual(r.start_at.isoformat(), new_start)

    def test_customer_cannot_complete_own_reservation(self):
        r = make_reservation(customer=self.customer)
        response = self.client.post(f"/api/reservations/{r.id}/complete/")
        self.assertEqual(response.status_code, 403)


class ReviewFlowTests(TestCase):
    """§9.2 Reviews — leave review on completed reservations."""

    def setUp(self):
        self.client = APIClient()
        self.customer = make_customer()
        self.client.force_authenticate(self.customer)
        self.reservation = make_reservation(customer=self.customer)
        # Push to completed
        transition(
            reservation=self.reservation,
            to_status=Reservation.Status.COMPLETED,
            actor=self.reservation.shop.owner,
        )

    def test_leave_review_on_completed_reservation(self):
        response = self.client.post(
            "/api/reviews/",
            {"reservation": self.reservation.id, "rating": 5, "comment": "Great service"},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertTrue(Review.objects.filter(reservation=self.reservation).exists())

    def test_cannot_review_uncompleted_reservation(self):
        other = make_reservation(customer=self.customer)  # still pending
        response = self.client.post(
            "/api/reviews/",
            {"reservation": other.id, "rating": 4, "comment": ""},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_cannot_review_someone_elses_reservation(self):
        someone_else = make_reservation()
        transition(
            reservation=someone_else,
            to_status=Reservation.Status.COMPLETED,
            actor=someone_else.shop.owner,
        )
        response = self.client.post(
            "/api/reviews/",
            {"reservation": someone_else.id, "rating": 5, "comment": ""},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_customer_can_delete_own_review(self):
        review = Review.objects.create(
            customer=self.customer,
            shop=self.reservation.shop,
            reservation=self.reservation,
            rating=5,
            comment="ok",
        )
        response = self.client.delete(f"/api/reviews/{review.id}/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Review.objects.filter(id=review.id).exists())


class FavoritesFlowTests(TestCase):
    """§9.2 Favorites."""

    def setUp(self):
        self.client = APIClient()
        self.customer = make_customer()
        self.shop = make_shop()
        self.client.force_authenticate(self.customer)

    def test_save_favorite(self):
        response = self.client.post(
            "/api/shops/favorites/", {"shop": self.shop.id}, format="json"
        )
        self.assertEqual(response.status_code, 201, response.content)

    def test_unsave_favorite(self):
        fav = Favorite.objects.create(customer=self.customer, shop=self.shop)
        response = self.client.delete(f"/api/shops/favorites/{fav.id}/")
        self.assertEqual(response.status_code, 204)

    def test_list_only_own_favorites(self):
        Favorite.objects.create(customer=self.customer, shop=self.shop)
        someone_else = make_customer()
        Favorite.objects.create(customer=someone_else, shop=make_shop())
        response = self.client.get("/api/shops/favorites/")
        results = response.json().get("results") or response.json()
        self.assertEqual(len(results), 1)


class CustomerStrikeTests(TestCase):
    """§9.2 Account health — restricted bookings."""

    def setUp(self):
        self.client = APIClient()
        self.customer = make_customer()
        self.shop = make_shop()
        self.service = make_service(shop=self.shop)

    def test_restricted_user_cannot_book(self):
        from datetime import timedelta

        from django.utils import timezone

        self.customer.restricted_until = timezone.now() + timedelta(days=10)
        self.customer.save()
        self.client.force_authenticate(self.customer)
        response = self.client.post(
            "/api/reservations/book/",
            {
                "shop": self.shop.id,
                "service": self.service.id,
                "start_at": future_dt(48).isoformat(),
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("restricted", str(response.content).lower())
