from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = ("email", "username", "role", "is_active", "is_staff")
    list_filter = ("role", "is_active", "is_staff")
    search_fields = ("email", "username", "first_name", "last_name")
    ordering = ("email",)

    fieldsets = UserAdmin.fieldsets + (
        ("Profile", {"fields": ("role", "phone", "avatar")}),
        (
            "Strike system",
            {"fields": ("no_show_count_90d", "cancellation_strikes_90d", "restricted_until")},
        ),
    )
