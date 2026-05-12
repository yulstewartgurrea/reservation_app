from django.contrib import admin

from .models import Payment


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ("id", "reservation", "provider", "amount", "currency", "status", "paid_at")
    list_filter = ("provider", "status", "currency")
    search_fields = ("provider_session_id", "reservation__id")
    readonly_fields = ("provider_session_id", "raw_payload", "created_at", "updated_at")
