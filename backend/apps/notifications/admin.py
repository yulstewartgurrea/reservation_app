from django.contrib import admin

from .models import MaintenanceReminder, Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("user", "kind", "title", "read_at", "created_at")
    list_filter = ("kind", "read_at")
    search_fields = ("user__email", "title")


@admin.register(MaintenanceReminder)
class MaintenanceReminderAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "shop",
        "customer",
        "interval_months",
        "next_due_at",
        "last_sent_at",
        "is_active",
    )
    list_filter = ("is_active", "interval_months")
    search_fields = ("title", "shop__name", "customer__email")
    autocomplete_fields = ("shop", "customer", "service", "created_by")
