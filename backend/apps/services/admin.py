from django.contrib import admin

from .models import Service, ServicePriceHistory, StaffService


@admin.register(Service)
class ServiceAdmin(admin.ModelAdmin):
    list_display = ("name", "shop", "category", "duration_minutes", "price", "is_active")
    list_filter = ("is_active", "category", "shop")
    search_fields = ("name", "shop__name")


@admin.register(ServicePriceHistory)
class ServicePriceHistoryAdmin(admin.ModelAdmin):
    list_display = ("service", "old_price", "new_price", "changed_by", "created_at")
    list_filter = ("created_at",)
    search_fields = ("service__name",)
    readonly_fields = ("service", "old_price", "new_price", "changed_by", "created_at")


# Category admin is registered once via apps/shops/admin.py since the model
# now lives there.
admin.site.register(StaffService)
