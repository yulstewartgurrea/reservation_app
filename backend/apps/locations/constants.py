"""PSGC code constants used by the locations app.

These are referenced by `views.py` when `LOCATIONS_RESTRICT_TO_ILIGAN` is on —
the testing-phase restriction that limits the cascading dropdowns to Iligan
City only. To open the platform to other cities, flip the setting to False
(or unset the env var); the constants themselves should not need to change.
"""

# Iligan City, Lanao Del Norte (Region X — Northern Mindanao).
ILIGAN_REGION_CODE = "100000000"
ILIGAN_PROVINCE_CODE = "103500000"
ILIGAN_CITY_CODE = "103504000"
