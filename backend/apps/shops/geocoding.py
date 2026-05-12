"""Address → lat/lng via OpenStreetMap Nominatim.

Free, no API key, but their usage policy requires:
- a descriptive User-Agent
- max 1 request per second (we hit it on shop create/update — well under that)

Falls back to (None, None) on any error so shop creation doesn't fail.
"""

from __future__ import annotations

import logging
from typing import Optional

import requests

logger = logging.getLogger(__name__)

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "Reserva/0.1 (+https://reserva.local)"


def geocode_address(address: str) -> Optional[tuple[float, float]]:
    if not address:
        return None
    try:
        response = requests.get(
            NOMINATIM_URL,
            params={"q": address, "format": "json", "limit": 1},
            headers={"User-Agent": USER_AGENT},
            timeout=5,
        )
        response.raise_for_status()
        results = response.json()
        if not results:
            return None
        return float(results[0]["lat"]), float(results[0]["lon"])
    except (requests.RequestException, KeyError, ValueError, IndexError) as exc:
        logger.warning("Geocoding failed for %r: %s", address, exc)
        return None
