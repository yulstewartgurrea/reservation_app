from rest_framework import serializers

from .models import Barangay, CityMunicipality, Province


class ProvinceSerializer(serializers.ModelSerializer):
    region_code = serializers.CharField(source="region_id", read_only=True)
    region_name = serializers.CharField(source="region.region_name", read_only=True)
    island_group = serializers.CharField(source="region.island_group", read_only=True)

    class Meta:
        model = Province
        fields = ("code", "name", "type", "region_code", "region_name", "island_group")


class CityMunicipalitySerializer(serializers.ModelSerializer):
    province_code = serializers.CharField(source="province_id", read_only=True)

    class Meta:
        model = CityMunicipality
        fields = ("code", "name", "type", "is_capital", "province_code")


class BarangaySerializer(serializers.ModelSerializer):
    city_code = serializers.CharField(source="city_id", read_only=True)

    class Meta:
        model = Barangay
        fields = ("code", "name", "city_code")
