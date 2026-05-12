from django.contrib import admin

from .models import CommissionLedger, Reservation, ReservationStatusHistory


@admin.register(Reservation)
class ReservationAdmin(admin.ModelAdmin):
    list_display = ("id", "shop", "service", "customer", "guest_name", "start_at", "status", "source")
    list_filter = ("status", "source", "shop")
    search_fields = ("customer__email", "guest_name", "guest_phone", "shop__name")
    date_hierarchy = "start_at"


admin.site.register(ReservationStatusHistory)
admin.site.register(CommissionLedger)
