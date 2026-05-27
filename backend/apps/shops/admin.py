from django.contrib import admin

from .models import (
    Category,
    Favorite,
    HoursOverride,
    Shop,
    ShopPhoto,
    Staff,
    StaffWorkingHours,
    TimeBlock,
    WeekdayHours,
)


class WeekdayHoursInline(admin.TabularInline):
    model = WeekdayHours
    extra = 0


class ShopPhotoInline(admin.TabularInline):
    model = ShopPhoto
    extra = 1


@admin.register(Shop)
class ShopAdmin(admin.ModelAdmin):
    list_display = ("name", "owner", "city", "status", "created_at")
    list_filter = ("status", "city", "categories")
    search_fields = ("name", "owner__email", "city")
    inlines = [WeekdayHoursInline, ShopPhotoInline]


admin.site.register(Category)
admin.site.register(Staff)
admin.site.register(StaffWorkingHours)
admin.site.register(HoursOverride)
admin.site.register(TimeBlock)
admin.site.register(Favorite)
