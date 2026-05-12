from django.conf import settings
from django.db import models


class ShopCategory(models.Model):
    name = models.CharField(max_length=64, unique=True)
    slug = models.SlugField(unique=True)

    class Meta:
        verbose_name_plural = "Shop categories"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Shop(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        PAUSED = "paused", "Paused"
        PENDING = "pending", "Pending review"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="shops",
    )
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    categories = models.ManyToManyField(ShopCategory, blank=True, related_name="shops")

    address_line = models.CharField(max_length=255)
    city = models.CharField(max_length=100)
    postal_code = models.CharField(max_length=20, blank=True)
    country = models.CharField(max_length=64, default="")
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    phone = models.CharField(max_length=32, blank=True)
    email = models.EmailField(blank=True)

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)

    commission_rate = models.DecimalField(
        max_digits=5,
        decimal_places=4,
        help_text="Per-shop commission rate (0..1). Falls back to platform default if null.",
        null=True,
        blank=True,
    )
    cancellation_window_hours = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Hours before start by which a customer can cancel without strike. Overrides platform default.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.name


class ShopPhoto(models.Model):
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name="photos")
    image = models.ImageField(upload_to="shops/")
    caption = models.CharField(max_length=255, blank=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order"]


class WeekdayHours(models.Model):
    class Weekday(models.IntegerChoices):
        MON = 0, "Monday"
        TUE = 1, "Tuesday"
        WED = 2, "Wednesday"
        THU = 3, "Thursday"
        FRI = 4, "Friday"
        SAT = 5, "Saturday"
        SUN = 6, "Sunday"

    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name="weekday_hours")
    weekday = models.IntegerField(choices=Weekday.choices)
    is_closed = models.BooleanField(default=False)
    open_time = models.TimeField(null=True, blank=True)
    close_time = models.TimeField(null=True, blank=True)

    class Meta:
        unique_together = ("shop", "weekday")
        ordering = ["weekday"]


class HoursOverride(models.Model):
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name="overrides")
    date = models.DateField()
    is_closed = models.BooleanField(default=False)
    open_time = models.TimeField(null=True, blank=True)
    close_time = models.TimeField(null=True, blank=True)
    note = models.CharField(max_length=255, blank=True)

    class Meta:
        unique_together = ("shop", "date")
        ordering = ["date"]


class TimeBlock(models.Model):
    """Manually blocked-off time (breaks, maintenance, vacations)."""

    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name="time_blocks")
    staff = models.ForeignKey(
        "shops.Staff",
        on_delete=models.CASCADE,
        related_name="time_blocks",
        null=True,
        blank=True,
        help_text="If set, the block applies only to this staff member.",
    )
    start_at = models.DateTimeField()
    end_at = models.DateTimeField()
    reason = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["start_at"]


class Staff(models.Model):
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name="staff")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="staff_profiles",
    )
    name = models.CharField(max_length=120)
    role = models.CharField(max_length=120, blank=True)
    photo = models.ImageField(upload_to="staff/", null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "Staff"

    def __str__(self) -> str:
        return f"{self.name} @ {self.shop.name}"


class StaffWorkingHours(models.Model):
    staff = models.ForeignKey(Staff, on_delete=models.CASCADE, related_name="working_hours")
    weekday = models.IntegerField(choices=WeekdayHours.Weekday.choices)
    is_off = models.BooleanField(default=False)
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)

    class Meta:
        unique_together = ("staff", "weekday")
        ordering = ["weekday"]


class Favorite(models.Model):
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="favorites",
    )
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name="favorited_by")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("customer", "shop")
        ordering = ["-created_at"]
