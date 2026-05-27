"""Public shop browse extensions — list aggregates, cities action, the
`is_shop_open_now` service helper, and the `?booking_date=` / `?min_rating=`
filters used by the browse page.

Backs the richer browse-page cards: rating / reviews_count / services_count
/ is_open_now plus the city filter dropdown and rating-based sorting.
"""

from datetime import date, datetime, time, timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.test_factories import (
    make_customer,
    make_resource,
    make_service,
    make_shop,
)
from apps.reservations.models import Reservation
from apps.reviews.models import Review
from apps.services.models import Service
from apps.shops.models import HoursOverride, Shop, WeekdayHours
from apps.shops.services import is_shop_open_now


def _add_review(shop, *, rating, customer=None):
    """Create a Review attached to a fresh completed reservation.

    Builds the reservation directly (bypassing availability/resource
    allocation) because this test file only cares about the review's
    `rating` and `shop`. The Reservation row is required because Review
    has a OneToOne FK onto it.
    """
    customer = customer or make_customer()
    service = shop.services.filter(is_active=True).first() or make_service(shop=shop)
    resource = shop.resources.first() or make_resource(shop=shop)
    start = timezone.now() - timedelta(days=Review.objects.filter(shop=shop).count() + 1)
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


class ShopListAggregatesTests(TestCase):
    """The list response surfaces services_count, reviews_count, avg_rating,
    is_open_now alongside the existing card fields."""

    def setUp(self):
        self.client = APIClient()

    def test_list_includes_new_aggregate_fields(self):
        rich = make_shop(name="Rich Shop", city="Cebu City")
        make_service(shop=rich, name="Cut")
        make_service(shop=rich, name="Shave")
        # Inactive services don't inflate the count.
        Service.objects.create(
            shop=rich,
            name="Hidden",
            duration_minutes=30,
            price="100.00",
            is_active=False,
        )
        _add_review(rich, rating=5)
        _add_review(rich, rating=4)

        bare = make_shop(name="Bare Shop", city="Iligan City")

        response = self.client.get("/api/shops/", {"ordering": "name"})
        self.assertEqual(response.status_code, 200)
        rows = {row["name"]: row for row in response.json()["results"]}

        self.assertEqual(rows["Rich Shop"]["services_count"], 2)
        self.assertEqual(rows["Rich Shop"]["reviews_count"], 2)
        self.assertEqual(rows["Rich Shop"]["avg_rating"], 4.5)
        self.assertIsInstance(rows["Rich Shop"]["is_open_now"], bool)

        self.assertEqual(rows["Bare Shop"]["services_count"], 0)
        self.assertEqual(rows["Bare Shop"]["reviews_count"], 0)
        self.assertIsNone(rows["Bare Shop"]["avg_rating"])

    def test_ordering_by_avg_rating_descending(self):
        low = make_shop(name="Low")
        high = make_shop(name="High")
        mid = make_shop(name="Mid")
        _add_review(low, rating=2)
        _add_review(mid, rating=3)
        _add_review(mid, rating=4)  # avg 3.5
        _add_review(high, rating=5)

        response = self.client.get("/api/shops/", {"ordering": "-avg_rating"})
        self.assertEqual(response.status_code, 200)
        order = [row["name"] for row in response.json()["results"]]
        self.assertEqual(order[:3], ["High", "Mid", "Low"])

    def test_ordering_by_reviews_count_descending(self):
        a = make_shop(name="A")
        b = make_shop(name="B")
        c = make_shop(name="C")
        for _ in range(3):
            _add_review(a, rating=5)
        _add_review(b, rating=5)
        # c stays at zero reviews

        response = self.client.get("/api/shops/", {"ordering": "-reviews_count"})
        self.assertEqual(response.status_code, 200)
        order = [row["name"] for row in response.json()["results"]]
        self.assertEqual(order, ["A", "B", "C"])


class ShopCitiesActionTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_cities_returns_distinct_sorted_list(self):
        make_shop(name="A", city="Cebu City")
        make_shop(name="B", city="Iligan City")
        make_shop(name="C", city="Cebu City")  # duplicate
        make_shop(name="D", city="Davao City")

        response = self.client.get("/api/shops/cities/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(), ["Cebu City", "Davao City", "Iligan City"]
        )

    def test_cities_excludes_inactive_shops_and_empty_cities(self):
        make_shop(name="Active", city="Visible")
        make_shop(name="Paused", city="Hidden", status=Shop.Status.PAUSED)
        make_shop(name="Pending", city="Hidden2", status=Shop.Status.PENDING)
        # Empty city — shouldn't appear.
        make_shop(name="No City", city="")

        response = self.client.get("/api/shops/cities/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), ["Visible"])


class IsShopOpenNowTests(TestCase):
    """Unit tests for the service helper. Pass `now` explicitly so the suite
    is deterministic without freezegun."""

    def _make_shop_closed_all_week(self) -> Shop:
        shop = make_shop(name="Closed", open_all_week=False)
        # Factory's default `open_all_week=False` leaves no WeekdayHours rows.
        return shop

    def _local(self, *, year, month, day, hour, minute=0) -> datetime:
        tz = timezone.get_current_timezone()
        return datetime(year, month, day, hour, minute, tzinfo=tz)

    def test_open_during_weekday_hours(self):
        shop = make_shop()  # open 08:00-20:00 every day
        # 2026-05-25 is a Monday.
        now = self._local(year=2026, month=5, day=25, hour=12)
        self.assertTrue(is_shop_open_now(shop, now=now))

    def test_closed_outside_weekday_hours(self):
        shop = make_shop()
        now = self._local(year=2026, month=5, day=25, hour=6)
        self.assertFalse(is_shop_open_now(shop, now=now))

    def test_closed_when_no_weekday_row_exists(self):
        shop = self._make_shop_closed_all_week()
        now = self._local(year=2026, month=5, day=25, hour=12)
        self.assertFalse(is_shop_open_now(shop, now=now))

    def test_override_closing_shop_today(self):
        shop = make_shop()
        now = self._local(year=2026, month=5, day=25, hour=12)
        HoursOverride.objects.create(
            shop=shop,
            date=now.date(),
            is_closed=True,
        )
        self.assertFalse(is_shop_open_now(shop, now=now))

    def test_override_changing_hours_today(self):
        shop = make_shop()  # weekday says 08:00-20:00
        now = self._local(year=2026, month=5, day=25, hour=9)
        # Override narrows hours to 12:00-15:00 — so 09:00 is now closed
        # despite weekday hours saying open.
        HoursOverride.objects.create(
            shop=shop,
            date=now.date(),
            is_closed=False,
            open_time=time(12, 0),
            close_time=time(15, 0),
        )
        self.assertFalse(is_shop_open_now(shop, now=now))
        # And inside the override window it should be open.
        within = self._local(year=2026, month=5, day=25, hour=13)
        self.assertTrue(is_shop_open_now(shop, now=within))

    def test_boundary_at_open_time_is_open(self):
        shop = make_shop()  # 08:00-20:00
        now = self._local(year=2026, month=5, day=25, hour=8, minute=0)
        self.assertTrue(is_shop_open_now(shop, now=now))

    def test_boundary_at_close_time_is_closed(self):
        shop = make_shop()  # 08:00-20:00
        now = self._local(year=2026, month=5, day=25, hour=20, minute=0)
        self.assertFalse(is_shop_open_now(shop, now=now))

    def test_weekday_marked_closed_returns_false(self):
        shop = make_shop(open_all_week=False)
        now = self._local(year=2026, month=5, day=25, hour=12)  # Monday
        WeekdayHours.objects.create(
            shop=shop,
            weekday=0,
            is_closed=True,
            open_time=time(8, 0),
            close_time=time(20, 0),
        )
        self.assertFalse(is_shop_open_now(shop, now=now))


class ShopListMinRatingFilterTests(TestCase):
    """`?min_rating=N` returns only shops whose avg rating >= N. Shops with
    no reviews drop out because their annotated avg is NULL."""

    def setUp(self):
        self.client = APIClient()

    def test_filters_below_threshold(self):
        five = make_shop(name="Five")
        _add_review(five, rating=5)
        three = make_shop(name="Three")
        _add_review(three, rating=3)
        none = make_shop(name="None")  # no reviews

        response = self.client.get("/api/shops/", {"min_rating": "4"})
        self.assertEqual(response.status_code, 200)
        names = {row["name"] for row in response.json()["results"]}
        self.assertEqual(names, {"Five"})

        response = self.client.get("/api/shops/", {"min_rating": "3"})
        self.assertEqual(response.status_code, 200)
        names = {row["name"] for row in response.json()["results"]}
        self.assertEqual(names, {"Five", "Three"})
        self.assertNotIn("None", names)

    def test_invalid_min_rating_is_ignored(self):
        rated = make_shop(name="Rated")
        _add_review(rated, rating=5)
        response = self.client.get("/api/shops/", {"min_rating": "not-a-number"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], 1)


class ShopListBookingDateFilterTests(TestCase):
    """`?booking_date=YYYY-MM-DD` returns only shops with at least one
    bookable slot on that date. Closed-that-day shops drop out; fully-booked
    shops do too. Shops without active services or resources are excluded."""

    def setUp(self):
        self.client = APIClient()
        # Pick a future weekday so `compute_slots`' "skip past times" guard
        # never wipes the window during the test.
        today = timezone.localdate()
        self.target_date = today + timedelta(days=7)
        self.weekday = self.target_date.weekday()

    def _isodate(self, d):
        return d.isoformat()

    def test_includes_shops_open_with_capacity(self):
        open_shop = make_shop(name="Open With Slots")
        make_service(shop=open_shop, name="Cut")
        response = self.client.get(
            "/api/shops/", {"booking_date": self._isodate(self.target_date)}
        )
        self.assertEqual(response.status_code, 200)
        names = {row["name"] for row in response.json()["results"]}
        self.assertIn("Open With Slots", names)

    def test_excludes_shops_closed_that_weekday(self):
        # Shop is closed every day of the week by default when open_all_week=False.
        closed = make_shop(name="Closed All Week", open_all_week=False)
        make_service(shop=closed, name="Cut")
        response = self.client.get(
            "/api/shops/", {"booking_date": self._isodate(self.target_date)}
        )
        self.assertEqual(response.status_code, 200)
        names = {row["name"] for row in response.json()["results"]}
        self.assertNotIn("Closed All Week", names)

    def test_excludes_shops_with_closing_override_on_that_date(self):
        shop = make_shop(name="Override Closed")
        make_service(shop=shop, name="Cut")
        HoursOverride.objects.create(
            shop=shop, date=self.target_date, is_closed=True
        )
        response = self.client.get(
            "/api/shops/", {"booking_date": self._isodate(self.target_date)}
        )
        names = {row["name"] for row in response.json()["results"]}
        self.assertNotIn("Override Closed", names)

    def test_excludes_shops_without_active_services(self):
        no_services = make_shop(name="No Services")
        response = self.client.get(
            "/api/shops/", {"booking_date": self._isodate(self.target_date)}
        )
        names = {row["name"] for row in response.json()["results"]}
        self.assertNotIn("No Services", names)

    def test_excludes_fully_booked_shops(self):
        """Saturate every Resource for the shop's whole open window so no
        free slot remains on the target date — the shop should drop out."""
        from apps.reservations.models import Reservation
        from apps.shops.models import WeekdayHours

        booked = make_shop(name="Fully Booked", resources=1)
        service = make_service(shop=booked, name="Cut", duration=60)
        # Narrow open hours to 09:00–11:00 so a single 2-hour reservation
        # consumes the entire window on the one resource.
        WeekdayHours.objects.filter(shop=booked, weekday=self.weekday).update(
            open_time=time(9, 0), close_time=time(11, 0)
        )
        resource = booked.resources.first()
        tz = timezone.get_current_timezone()
        start = datetime.combine(self.target_date, time(9, 0), tzinfo=tz)
        end = datetime.combine(self.target_date, time(11, 0), tzinfo=tz)
        Reservation.objects.create(
            customer=make_customer(),
            shop=booked,
            service=service,
            resource=resource,
            start_at=start,
            end_at=end,
            status=Reservation.Status.CONFIRMED,
            source=Reservation.Source.ONLINE,
            unit_price=service.price,
            total_price=service.price,
        )

        response = self.client.get(
            "/api/shops/", {"booking_date": self._isodate(self.target_date)}
        )
        names = {row["name"] for row in response.json()["results"]}
        self.assertNotIn("Fully Booked", names)

    def test_past_date_returns_empty(self):
        # Open shop with capacity — but the date is in the past.
        shop = make_shop(name="Time Traveler")
        make_service(shop=shop, name="Cut")
        past = timezone.localdate() - timedelta(days=1)
        response = self.client.get("/api/shops/", {"booking_date": self._isodate(past)})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], 0)

    def test_invalid_date_string_is_ignored(self):
        shop = make_shop(name="Visible")
        make_service(shop=shop, name="Cut")
        response = self.client.get("/api/shops/", {"booking_date": "not-a-date"})
        self.assertEqual(response.status_code, 200)
        names = {row["name"] for row in response.json()["results"]}
        self.assertIn("Visible", names)


class ShopListBookingTimeFilterTests(TestCase):
    """`?booking_time=HH:MM` narrows `?booking_date` matches to shops with a
    slot starting within +/-30 min of that time. Without booking_date the
    param is a no-op."""

    def setUp(self):
        self.client = APIClient()
        today = timezone.localdate()
        self.target_date = today + timedelta(days=7)
        self.weekday = self.target_date.weekday()

    def _isodate(self, d):
        return d.isoformat()

    def test_filters_to_shops_open_at_that_time(self):
        from apps.shops.models import WeekdayHours

        morning = make_shop(name="Morning Only")
        make_service(shop=morning, name="Cut", duration=60)
        WeekdayHours.objects.filter(shop=morning, weekday=self.weekday).update(
            open_time=time(8, 0), close_time=time(11, 0)
        )
        afternoon = make_shop(name="Afternoon Only")
        make_service(shop=afternoon, name="Cut", duration=60)
        WeekdayHours.objects.filter(shop=afternoon, weekday=self.weekday).update(
            open_time=time(14, 0), close_time=time(18, 0)
        )

        response = self.client.get(
            "/api/shops/",
            {
                "booking_date": self._isodate(self.target_date),
                "booking_time": "15:00",
            },
        )
        names = {row["name"] for row in response.json()["results"]}
        self.assertIn("Afternoon Only", names)
        self.assertNotIn("Morning Only", names)

    def test_window_is_forgiving(self):
        """A slot 20 min after the requested time still counts — we don't
        force customers to pick exact 15-min boundaries."""
        from apps.shops.models import WeekdayHours

        shop = make_shop(name="Open Late")
        make_service(shop=shop, name="Cut", duration=60)
        WeekdayHours.objects.filter(shop=shop, weekday=self.weekday).update(
            open_time=time(13, 30), close_time=time(18, 0)
        )
        # First slot is 13:30; requested 13:00 -> within 30-min window.
        response = self.client.get(
            "/api/shops/",
            {
                "booking_date": self._isodate(self.target_date),
                "booking_time": "13:00",
            },
        )
        names = {row["name"] for row in response.json()["results"]}
        self.assertIn("Open Late", names)

    def test_invalid_time_string_is_ignored(self):
        shop = make_shop(name="Visible")
        make_service(shop=shop, name="Cut")
        response = self.client.get(
            "/api/shops/",
            {
                "booking_date": self._isodate(self.target_date),
                "booking_time": "not-a-time",
            },
        )
        names = {row["name"] for row in response.json()["results"]}
        self.assertIn("Visible", names)


class ShopListGuestsFilterTests(TestCase):
    """`?guests=N` filters out shops whose services can't accommodate the
    party size — `Service.max_quantity` is the per-booking cap."""

    def setUp(self):
        self.client = APIClient()
        today = timezone.localdate()
        self.target_date = today + timedelta(days=7)

    def _isodate(self, d):
        return d.isoformat()

    def test_excludes_shops_whose_services_cap_below_party_size(self):
        from apps.services.models import Service

        small = make_shop(name="Single-Booking Only")
        only = make_service(shop=small, name="Cut")
        Service.objects.filter(pk=only.pk).update(max_quantity=1)

        family = make_shop(name="Family Friendly")
        many = make_service(shop=family, name="Cut")
        Service.objects.filter(pk=many.pk).update(max_quantity=4)

        response = self.client.get(
            "/api/shops/",
            {"booking_date": self._isodate(self.target_date), "guests": "3"},
        )
        names = {row["name"] for row in response.json()["results"]}
        self.assertIn("Family Friendly", names)
        self.assertNotIn("Single-Booking Only", names)

    def test_guests_one_keeps_default_behavior(self):
        shop = make_shop(name="Solo")
        make_service(shop=shop, name="Cut")
        response = self.client.get(
            "/api/shops/",
            {"booking_date": self._isodate(self.target_date), "guests": "1"},
        )
        names = {row["name"] for row in response.json()["results"]}
        self.assertIn("Solo", names)

    def test_invalid_guests_value_is_ignored(self):
        shop = make_shop(name="Visible")
        make_service(shop=shop, name="Cut")
        response = self.client.get(
            "/api/shops/",
            {
                "booking_date": self._isodate(self.target_date),
                "guests": "not-a-number",
            },
        )
        names = {row["name"] for row in response.json()["results"]}
        self.assertIn("Visible", names)
