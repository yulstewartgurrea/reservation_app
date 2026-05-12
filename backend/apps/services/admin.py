from django.contrib import admin

from .models import Service, ServiceCategory, StaffService


@admin.register(Service)
class ServiceAdmin(admin.ModelAdmin):
    list_display = ("name", "shop", "category", "duration_minutes", "price", "is_active")
    list_filter = ("is_active", "category", "shop")
    search_fields = ("name", "shop__name")


admin.site.register(ServiceCategory)
admin.site.register(StaffService)
