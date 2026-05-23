"""Admin for the PSGC location master tables.

This is seeded reference data (see the `seed_psgc` command), so the admin is
browse/search-only — adding, editing, or deleting rows by hand would desync the
codes from the official PSGC. To refresh, re-run `seed_psgc --force`.
"""

from django.contrib import admin

from .models import Barangay, CityMunicipality, Province, Region


class ReadOnlyAdmin(admin.ModelAdmin):
    """Browsable but not editable — reference data is managed via `seed_psgc`."""

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        # Allow opening the (read-only) detail view, but not saving.
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Region)
class RegionAdmin(ReadOnlyAdmin):
    list_display = ("code", "name", "region_name", "island_group")
    list_filter = ("island_group",)
    search_fields = ("code", "name", "region_name")


@admin.register(Province)
class ProvinceAdmin(ReadOnlyAdmin):
    list_display = ("code", "name", "type", "region")
    list_filter = ("type",)
    search_fields = ("code", "name")
    autocomplete_fields = ("region",)
    list_select_related = ("region",)


@admin.register(CityMunicipality)
class CityMunicipalityAdmin(ReadOnlyAdmin):
    list_display = ("code", "name", "type", "is_capital", "province")
    list_filter = ("type", "is_capital")
    search_fields = ("code", "name")
    autocomplete_fields = ("province",)
    list_select_related = ("province",)


@admin.register(Barangay)
class BarangayAdmin(ReadOnlyAdmin):
    list_display = ("code", "name", "city")
    search_fields = ("code", "name")
    autocomplete_fields = ("city",)
    list_select_related = ("city",)
