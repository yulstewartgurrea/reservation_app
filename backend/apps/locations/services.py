"""Service layer for the locations (PSGC) app.

The only non-trivial logic here is the bulk seed, which loads the in-app
`data/psgc_hierarchy.json` (17 regions / 87 provinces / 1648 cities /
42046 barangays) into the four reference tables. We `bulk_create` in batches
rather than `update_or_create` per row — the latter would issue ~44k queries.
"""

import json
from pathlib import Path

from django.db import transaction

from .models import Barangay, CityMunicipality, Province, Region

DATA_FILE = Path(__file__).resolve().parent / "data" / "psgc_hierarchy.json"

BATCH_SIZE = 2000


def _load_hierarchy() -> list:
    with DATA_FILE.open(encoding="utf-8") as fh:
        return json.load(fh)


@transaction.atomic
def seed_psgc(force: bool = False) -> dict:
    """Seed the PSGC tables from the bundled JSON hierarchy.

    Idempotent: if barangays are already populated and `force` is False, this
    is a no-op returning ``{"skipped": True}``. With `force=True` all four
    tables are wiped and reseeded.

    Returns a dict of inserted counts (or the skip marker).
    """
    already_seeded = Barangay.objects.exists()
    if already_seeded and not force:
        return {"skipped": True}

    if force:
        # FK cascade would handle children, but be explicit + order-independent.
        Barangay.objects.all().delete()
        CityMunicipality.objects.all().delete()
        Province.objects.all().delete()
        Region.objects.all().delete()

    hierarchy = _load_hierarchy()

    regions: list[Region] = []
    provinces: list[Province] = []
    cities: list[CityMunicipality] = []
    barangays: list[Barangay] = []

    for region in hierarchy:
        regions.append(
            Region(
                code=region["code"],
                name=region["name"],
                region_name=region.get("regionName", "") or "",
                island_group=region.get("islandGroup", "") or "",
            )
        )
        for province in region["provinces"]:
            provinces.append(
                Province(
                    code=province["code"],
                    name=province["name"],
                    type=province.get("type", ""),
                    region_id=region["code"],
                )
            )
            for city in province["cities_municipalities"]:
                cities.append(
                    CityMunicipality(
                        code=city["code"],
                        name=city["name"],
                        type=city.get("type", ""),
                        is_capital=bool(city.get("isCapital", False)),
                        province_id=province["code"],
                    )
                )
                for barangay in city["barangays"]:
                    barangays.append(
                        Barangay(
                            code=barangay["code"],
                            name=barangay["name"],
                            city_id=city["code"],
                        )
                    )

    Region.objects.bulk_create(regions, batch_size=BATCH_SIZE)
    Province.objects.bulk_create(provinces, batch_size=BATCH_SIZE)
    CityMunicipality.objects.bulk_create(cities, batch_size=BATCH_SIZE)
    Barangay.objects.bulk_create(barangays, batch_size=BATCH_SIZE)

    return {
        "skipped": False,
        "regions": len(regions),
        "provinces": len(provinces),
        "cities": len(cities),
        "barangays": len(barangays),
    }
