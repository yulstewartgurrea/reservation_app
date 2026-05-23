#!/usr/bin/env python3
"""Build a full Philippine location dataset (Region -> Province -> City/Municipality -> Barangay).

Source: PSGC (Philippine Standard Geographic Code), via the static dataset at
https://psgc.gitlab.io/api which is generated directly from the PSA PSGC publication.

Outputs (next to this script):
  raw/*.json          the untouched flat files as downloaded
  psgc_hierarchy.json a single nested tree of region -> province -> city -> barangay
  psgc_flat.csv       one row per barangay with the full parent chain

Run:  python3 build_psgc.py
"""
import csv
import json
import os
import urllib.request

BASE = "https://psgc.gitlab.io/api"
HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")

# NCR (and a few others) use "districts" instead of provinces, and Manila uses
# "sub-municipalities" instead of cities. We fold those into the province / city
# levels so the tree is a clean 4 levels everywhere.
FILES = {
    "regions": "regions.json",
    "provinces": "provinces.json",
    "districts": "districts.json",
    "cities_municipalities": "cities-municipalities.json",
    "sub_municipalities": "sub-municipalities.json",
    "barangays": "barangays.json",
}


def fetch(name, filename):
    """Load a flat file from raw/. If missing, download it via urllib.

    The raw files are normally fetched once with curl (macOS system Python may
    lack CA certs for urllib). Re-running just reads them from disk.
    """
    path = os.path.join(RAW, filename)
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    else:
        url = f"{BASE}/{filename}"
        print(f"  downloading {url} ...")
        with urllib.request.urlopen(url) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"    {len(data):>6} {name}")
    return data


def code(v):
    """PSGC parent fields are either a code string or the literal False."""
    return v if isinstance(v, str) and v else None


def main():
    os.makedirs(RAW, exist_ok=True)
    print("Downloading PSGC flat files:")
    raw = {name: fetch(name, fn) for name, fn in FILES.items()}

    # --- province level: real provinces + NCR-style districts ---
    provinces = {}
    for p in raw["provinces"]:
        provinces[p["code"]] = {
            "code": p["code"],
            "name": p["name"],
            "type": "province",
            "regionCode": code(p.get("regionCode")),
            "cities_municipalities": {},
        }
    for d in raw["districts"]:
        provinces[d["code"]] = {
            "code": d["code"],
            "name": d["name"],
            "type": "district",
            "regionCode": code(d.get("regionCode")),
            "cities_municipalities": {},
        }

    # --- city/municipality level: cities-municipalities + sub-municipalities ---
    cities = {}
    for c in raw["cities_municipalities"]:
        ctype = "city" if c.get("isCity") else "municipality"
        cities[c["code"]] = {
            "code": c["code"],
            "name": c["name"],
            "type": ctype,
            "isCapital": bool(c.get("isCapital")),
            "parentCode": code(c.get("provinceCode")) or code(c.get("districtCode")),
            "regionCode": code(c.get("regionCode")),
            "barangays": [],
        }
    for s in raw["sub_municipalities"]:
        cities[s["code"]] = {
            "code": s["code"],
            "name": s["name"],
            "type": "sub-municipality",
            "isCapital": False,
            "parentCode": code(s.get("provinceCode")) or code(s.get("districtCode")),
            "regionCode": code(s.get("regionCode")),
            "barangays": [],
        }

    # --- barangays attach to their most specific parent ---
    orphan_bgy = 0
    for b in raw["barangays"]:
        parent = (
            code(b.get("subMunicipalityCode"))
            or code(b.get("cityCode"))
            or code(b.get("municipalityCode"))
        )
        node = {"code": b["code"], "name": b["name"], "type": "barangay"}
        if parent and parent in cities:
            cities[parent]["barangays"].append(node)
        else:
            orphan_bgy += 1

    # --- attach cities to provinces/districts ---
    # A few independent component cities (e.g. Cotabato City, Isabela City) have
    # no province and no district -- they sit directly under a region. Give each
    # its own province-level node so the tree stays 4 levels and no barangay is lost.
    orphan_city = 0
    for c in cities.values():
        c["barangays"].sort(key=lambda x: x["name"])
        parent = c["parentCode"]
        if not parent or parent not in provinces:
            if c["regionCode"]:
                parent = c["code"]
                provinces[parent] = {
                    "code": c["code"],
                    "name": c["name"],
                    "type": "independent-city",
                    "regionCode": c["regionCode"],
                    "cities_municipalities": {},
                }
            else:
                orphan_city += 1
                continue
        provinces[parent]["cities_municipalities"][c["code"]] = c

    # --- assemble region tree ---
    tree = []
    for r in raw["regions"]:
        region = {
            "code": r["code"],
            "name": r["name"],
            "regionName": r.get("regionName", ""),
            "islandGroup": r.get("islandGroupCode", ""),
            "provinces": [],
        }
        for p in provinces.values():
            if p["regionCode"] == r["code"]:
                p_out = {
                    "code": p["code"],
                    "name": p["name"],
                    "type": p["type"],
                    "cities_municipalities": sorted(
                        p["cities_municipalities"].values(), key=lambda x: x["name"]
                    ),
                }
                region["provinces"].append(p_out)
        region["provinces"].sort(key=lambda x: x["name"])
        tree.append(region)
    tree.sort(key=lambda x: x["name"])

    out_json = os.path.join(HERE, "psgc_hierarchy.json")
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(tree, f, ensure_ascii=False, indent=2)

    # --- flat CSV: one row per barangay with full chain ---
    out_csv = os.path.join(HERE, "psgc_flat.csv")
    rows = 0
    with open(out_csv, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow([
            "region_code", "region_name", "island_group",
            "province_code", "province_name", "province_type",
            "city_code", "city_name", "city_type", "is_capital",
            "barangay_code", "barangay_name",
        ])
        for region in tree:
            for prov in region["provinces"]:
                for city in prov["cities_municipalities"]:
                    for bgy in city["barangays"]:
                        w.writerow([
                            region["code"], region["name"], region["islandGroup"],
                            prov["code"], prov["name"], prov["type"],
                            city["code"], city["name"], city["type"], city["isCapital"],
                            bgy["code"], bgy["name"],
                        ])
                        rows += 1

    print("\nDone.")
    print(f"  regions:                {len(tree)}")
    print(f"  provinces + districts:  {len(provinces)}")
    print(f"  cities/municipalities:  {len(cities)}")
    print(f"  barangays (rows):       {rows}")
    if orphan_bgy:
        print(f"  WARNING orphan barangays (no parent matched): {orphan_bgy}")
    if orphan_city:
        print(f"  WARNING orphan cities (no parent matched):    {orphan_city}")
    print(f"\n  -> {out_json}")
    print(f"  -> {out_csv}")
    print(f"  -> {RAW}/ (raw flat files)")


if __name__ == "__main__":
    main()
