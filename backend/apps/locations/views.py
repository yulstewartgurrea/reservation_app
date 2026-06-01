"""Public, read-only cascading PSGC lookup API.

All endpoints are unauthenticated reads and return the full filtered list
(no pagination) so the frontend can populate cascading dropdowns in one call.

While the `LOCATIONS_RESTRICT_TO_ILIGAN` setting is on (pilot phase) every
endpoint is scoped to Iligan City — the province list returns only Lanao Del
Norte, the city list returns only Iligan City regardless of the `province`
query param, and the barangay list returns Iligan's barangays only.
"""

from django.conf import settings
from rest_framework import permissions
from rest_framework.exceptions import ValidationError
from rest_framework.generics import ListAPIView

from .constants import (
    ILIGAN_CITY_CODE,
    ILIGAN_PROVINCE_CODE,
)
from .models import Barangay, CityMunicipality, Province
from .serializers import (
    BarangaySerializer,
    CityMunicipalitySerializer,
    ProvinceSerializer,
)


def _iligan_only() -> bool:
    return bool(getattr(settings, "LOCATIONS_RESTRICT_TO_ILIGAN", False))


class ProvinceListView(ListAPIView):
    """GET /api/locations/provinces/ — all provinces (with region info)."""

    permission_classes = [permissions.AllowAny]
    pagination_class = None
    serializer_class = ProvinceSerializer

    def get_queryset(self):
        qs = Province.objects.select_related("region").order_by("name")
        if _iligan_only():
            qs = qs.filter(code=ILIGAN_PROVINCE_CODE)
        return qs


class CityListView(ListAPIView):
    """GET /api/locations/cities/?province=<code> — cities of one province."""

    permission_classes = [permissions.AllowAny]
    pagination_class = None
    serializer_class = CityMunicipalitySerializer

    def get_queryset(self):
        province = self.request.query_params.get("province")
        if not province:
            raise ValidationError({"province": "This query parameter is required."})
        qs = CityMunicipality.objects.filter(province_id=province).order_by("name")
        if _iligan_only():
            # Only Iligan is selectable during the pilot — collapse the result
            # set even if a caller passes a different province code.
            qs = qs.filter(code=ILIGAN_CITY_CODE)
        return qs


class BarangayListView(ListAPIView):
    """GET /api/locations/barangays/?city=<code> — barangays of one city."""

    permission_classes = [permissions.AllowAny]
    pagination_class = None
    serializer_class = BarangaySerializer

    def get_queryset(self):
        city = self.request.query_params.get("city")
        if not city:
            raise ValidationError({"city": "This query parameter is required."})
        qs = Barangay.objects.filter(city_id=city).order_by("name")
        if _iligan_only():
            qs = qs.filter(city_id=ILIGAN_CITY_CODE)
        return qs
