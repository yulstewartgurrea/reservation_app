"""Public shop list — pagination, search, and active-only filtering.

Covers the customer-facing `/api/shops/` browse endpoint that the frontend
shops page consumes (paginated grid with debounced search).
"""

from rest_framework.test import APIClient

from django.test import TestCase

from apps.core.test_factories import make_shop
from apps.shops.models import Shop


class PublicShopListTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_list_is_paginated_with_default_page_size_12(self):
        for i in range(15):
            make_shop(name=f"Shop {i:02d}")
        response = self.client.get("/api/shops/")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["count"], 15)
        self.assertEqual(len(body["results"]), 12)
        self.assertIsNotNone(body["next"])

    def test_list_respects_page_size_query_param(self):
        for i in range(5):
            make_shop(name=f"Shop {i}")
        response = self.client.get("/api/shops/", {"page_size": 3})
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["count"], 5)
        self.assertEqual(len(body["results"]), 3)

    def test_list_excludes_non_active_shops(self):
        make_shop(name="Visible", status=Shop.Status.ACTIVE)
        make_shop(name="Hidden Pending", status=Shop.Status.PENDING)
        make_shop(name="Hidden Paused", status=Shop.Status.PAUSED)
        response = self.client.get("/api/shops/")
        self.assertEqual(response.status_code, 200)
        names = {row["name"] for row in response.json()["results"]}
        self.assertEqual(names, {"Visible"})

    def test_search_filters_by_name(self):
        make_shop(name="Red Card Market")
        make_shop(name="Blue Bistro")
        response = self.client.get("/api/shops/", {"search": "red"})
        self.assertEqual(response.status_code, 200)
        names = [row["name"] for row in response.json()["results"]]
        self.assertEqual(names, ["Red Card Market"])

    def test_search_filters_by_city(self):
        make_shop(name="A", city="Iligan")
        make_shop(name="B", city="Cebu")
        response = self.client.get("/api/shops/", {"search": "iligan"})
        self.assertEqual(response.status_code, 200)
        results = response.json()["results"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["city"], "Iligan")
