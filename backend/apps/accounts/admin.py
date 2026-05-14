from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import EmailOTP, User


@admin.register(EmailOTP)
class EmailOTPAdmin(admin.ModelAdmin):
    list_display = ("user", "purpose", "expires_at", "consumed_at", "attempts", "created_at")
    list_filter = ("purpose",)
    search_fields = ("user__email",)
    readonly_fields = ("code_hash", "created_at")


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
