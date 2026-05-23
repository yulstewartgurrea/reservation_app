import json
from unittest import mock

from django.test import TestCase
from rest_framework.test import APITestCase

from apps.locations import services
from apps.locations.models import Barangay, CityMunicipality, Province, Region
from apps.locations.services import seed_psgc

# Tiny two-region fixture mirroring the real psgc_hierarchy.json shape so the
# seed test stays fast (the real file has 42k barangays).
FIXTURE = [
    {
        "code": "010000000",
        "name": "Ilocos Region",
        "regionName": "Region I",
        "islandGroup": "luzon",
        "provinces": [
            {
                "code": "012800000",
                "name": "Ilocos Norte",
                "type": "province",
                "cities_municipalities": [
                    {
                        "code": "012801000",
                        "name": "Adams",
                        "type": "municipality",
                        "isCapital": False,
                        "barangays": [
                            {"code": "012801001", "name": "Adams (Pob.)", "type": "barangay"},
                        ],
                    },
                    {
                        "code": "012802000",
                        "name": "Bacarra",
                        "type": "municipality",
                        "isCapital": True,
                        "barangays": [
                            {"code": "012802001", "name": "Bani", "type": "barangay"},
                            {"code": "012802002", "name": "Buyon", "type": "barangay"},
                        ],
                    },
                ],
            }
        ],
    },
    {
        "code": "130000000",
        "name": "National Capital Region",
        "regionName": "NCR",
        "islandGroup": "luzon",
        "provinces": [
            {
                "code": "133900000",
                "name": "City of Manila",
                "type": "district",
                "cities_municipalities": [
                    {
                        "code": "133901000",
                        "name": "Tondo",
                        "type": "sub-municipality",
                        "isCapital": False,
                        "barangays": [
                            {"code": "133901001", "name": "Barangay 1", "type": "barangay"},
                        ],
                    },
                ],
            }
        ],
    },
]


class SeedPsgcTests(TestCase):
    def _seed_fixture(self, force=False):
        with mock.patch.object(services, "_load_hierarchy", return_value=FIXTURE):
            return seed_psgc(force=force)

    def test_seed_populates_correct_counts_and_links(self):
        result = self._seed_fixture()

        self.assertFalse(result["skipped"])
        self.assertEqual(result["regions"], 2)
        self.assertEqual(result["provinces"], 2)
        self.assertEqual(result["cities"], 3)
        self.assertEqual(result["barangays"], 4)

        self.assertEqual(Region.objects.count(), 2)
        self.assertEqual(Province.objects.count(), 2)
        self.assertEqual(CityMunicipality.objects.count(), 3)
        self.assertEqual(Barangay.objects.count(), 4)

        # FK links resolve end to end.
        brgy = Barangay.objects.get(code="012802001")
        self.assertEqual(brgy.city.code, "012802000")
        self.assertEqual(brgy.city.province.code, "012800000")
        self.assertEqual(brgy.city.province.region.code, "010000000")
        self.assertEqual(brgy.city.province.region.region_name, "Region I")
        self.assertEqual(brgy.city.province.region.island_group, "luzon")

        bacarra = CityMunicipality.objects.get(code="012802000")
        self.assertTrue(bacarra.is_capital)
        self.assertEqual(bacarra.barangays.count(), 2)

    def test_seed_is_idempotent_without_force(self):
        self._seed_fixture()
        result = self._seed_fixture()
        self.assertTrue(result["skipped"])
        self.assertEqual(Barangay.objects.count(), 4)

    def test_force_wipes_and_reseeds(self):
        self._seed_fixture()
        result = self._seed_fixture(force=True)
        self.assertFalse(result["skipped"])
        self.assertEqual(Barangay.objects.count(), 4)
        self.assertEqual(Region.objects.count(), 2)


class LocationApiTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        with mock.patch.object(services, "_load_hierarchy", return_value=FIXTURE):
            seed_psgc()

    def test_provinces_returns_all_with_region_info(self):
        resp = self.client.get("/api/locations/provinces/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data), 2)
        # ordered by name: "City of Manila" before "Ilocos Norte"
        self.assertEqual(data[0]["name"], "City of Manila")
        ilocos = next(p for p in data if p["code"] == "012800000")
        self.assertEqual(
            set(ilocos.keys()),
            {"code", "name", "type", "region_code", "region_name", "island_group"},
        )
        self.assertEqual(ilocos["region_code"], "010000000")
        self.assertEqual(ilocos["region_name"], "Region I")
        self.assertEqual(ilocos["island_group"], "luzon")
        self.assertEqual(ilocos["type"], "province")

    def test_cities_requires_province_param(self):
        resp = self.client.get("/api/locations/cities/")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("province", resp.json())

    def test_cities_filters_by_province(self):
        resp = self.client.get("/api/locations/cities/?province=012800000")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data), 2)
        self.assertEqual(data[0]["name"], "Adams")  # ordered by name
        adams = next(c for c in data if c["code"] == "012801000")
        self.assertEqual(
            set(adams.keys()),
            {"code", "name", "type", "is_capital", "province_code"},
        )
        self.assertEqual(adams["province_code"], "012800000")
        self.assertFalse(adams["is_capital"])

    def test_barangays_requires_city_param(self):
        resp = self.client.get("/api/locations/barangays/")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("city", resp.json())

    def test_barangays_filters_by_city(self):
        resp = self.client.get("/api/locations/barangays/?city=012802000")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data), 2)
        self.assertEqual(data[0]["name"], "Bani")  # ordered by name
        self.assertEqual(
            set(data[0].keys()),
            {"code", "name", "city_code"},
        )
        self.assertEqual(data[0]["city_code"], "012802000")

    def test_endpoints_are_public(self):
        # No auth header set; all three should be reachable.
        self.assertEqual(self.client.get("/api/locations/provinces/").status_code, 200)
        self.assertEqual(
            self.client.get("/api/locations/cities/?province=012800000").status_code, 200
        )
        self.assertEqual(
            self.client.get("/api/locations/barangays/?city=012801000").status_code, 200
        )
