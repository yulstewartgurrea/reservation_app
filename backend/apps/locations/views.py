"""Public, read-only cascading PSGC lookup API.

All endpoints are unauthenticated reads and return the full filtered list
(no pagination) so the frontend can populate cascading dropdowns in one call.
"""

from rest_framework import permissions
from rest_framework.exceptions import ValidationError
from rest_framework.generics import ListAPIView

from .models import Barangay, CityMunicipality, Province
from .serializers import (
    BarangaySerializer,
    CityMunicipalitySerializer,
    ProvinceSerializer,
)


class ProvinceListView(ListAPIView):
    """GET /api/locations/provinces/ — all provinces (with region info)."""

    permission_classes = [permissions.AllowAny]
    pagination_class = None
    serializer_class = ProvinceSerializer
    # select_related avoids an N+1 on region_name / island_group.
    queryset = Province.objects.select_related("region").order_by("name")


class CityListView(ListAPIView):
    """GET /api/locations/cities/?province=<code> — cities of one province."""

    permission_classes = [permissions.AllowAny]
    pagination_class = None
    serializer_class = CityMunicipalitySerializer

    def get_queryset(self):
        province = self.request.query_params.get("province")
        if not province:
            raise ValidationError({"province": "This query parameter is required."})
        return (
            CityMunicipality.objects.filter(province_id=province).order_by("name")
        )


class BarangayListView(ListAPIView):
    """GET /api/locations/barangays/?city=<code> — barangays of one city."""

    permission_classes = [permissions.AllowAny]
    pagination_class = None
    serializer_class = BarangaySerializer

    def get_queryset(self):
        city = self.request.query_params.get("city")
        if not city:
            raise ValidationError({"city": "This query parameter is required."})
        return Barangay.objects.filter(city_id=city).order_by("name")
