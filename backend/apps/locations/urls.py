from django.urls import path

from .views import BarangayListView, CityListView, ProvinceListView

urlpatterns = [
    path("provinces/", ProvinceListView.as_view(), name="locations-provinces"),
    path("cities/", CityListView.as_view(), name="locations-cities"),
    path("barangays/", BarangayListView.as_view(), name="locations-barangays"),
]
