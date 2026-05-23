# Philippine locations (PSGC)

Full administrative hierarchy of the Philippines:
**Region → Province → City/Municipality → Barangay.**

## Source

Derived from the **Philippine Standard Geographic Code (PSGC)**, the official
classification published by the Philippine Statistics Authority (PSA). The flat
files are pulled from the static dataset at <https://psgc.gitlab.io/api>, which
is generated directly from the PSA PSGC publication.

Downloaded: 2026-05-21.

## Files

| File | What |
|------|------|
| `psgc_hierarchy.json` | Nested tree: regions → provinces → cities/municipalities → barangays. |
| `psgc_flat.csv` | One row per barangay with the full parent chain (good for DB import / spreadsheets). |
| `raw/*.json` | Untouched flat files as downloaded (one per level). |
| `build_psgc.py` | Script that reads `raw/` and regenerates the two outputs. |

## Counts

- 17 regions
- 87 province-level nodes (81 provinces + 4 NCR districts + 2 independent cities)
- 1,648 cities/municipalities (+ 14 Manila sub-municipalities)
- 42,046 barangays

## Notes on the hierarchy

The PSGC isn't a clean 4-level tree, so a few special cases are normalized:

- **NCR** has no provinces — its 4 legislative **districts** are used as the
  province level (`province_type = "district"`).
- **Manila** splits its barangays across 14 **sub-municipalities** (Tondo I/II,
  Sampaloc, etc.), kept at the city level (`city_type = "sub-municipality"`).
  The "City of Manila" entry itself therefore has no direct barangays.
- **Independent component cities** with no province (Cotabato City, Isabela
  City) are attached directly under their region as their own province-level
  node (`province_type = "independent-city"`).

## Regenerate

```bash
# refresh raw files (macOS system Python may lack CA certs, so use curl):
cd raw
for f in regions provinces districts cities-municipalities sub-municipalities barangays; do
  curl -s "https://psgc.gitlab.io/api/$f.json" -o "$f.json"
done
cd ..
python3 build_psgc.py
```

`build_psgc.py` reads from `raw/` if present, otherwise downloads via urllib.
