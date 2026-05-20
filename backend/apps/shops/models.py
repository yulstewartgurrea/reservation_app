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
    address_line_2 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100)
    state_province = models.CharField(max_length=100, blank=True)
    barangay = models.CharField(max_length=100, blank=True)
    postal_code = models.CharField(max_length=20, blank=True)
    country = models.CharField(max_length=64, default="")
    landmark = models.CharField(max_length=255, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    phone = models.CharField(max_length=32, blank=True)
    email = models.EmailField(blank=True)

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)

    resource_label = models.CharField(
        max_length=32,
        default="Station",
        help_text=(
            "The word this shop uses for its bookable Resources, shown in the "
            'UI: "Bay" (carwash), "Chair" (salon), "Room" (spa/dental), '
            '"Table" (restaurant), or "Slot". Purely cosmetic — it does not '
            "change scheduling behaviour. See the Resource model."
        ),
    )

    auto_paused_for_unpaid_commission = models.BooleanField(
        default=False,
        help_text=(
            "True when the platform auto-paused this shop for an overdue unpaid "
            "commission invoice. Lets auto-resume on payment flip it back ACTIVE "
            "without clobbering an owner-initiated manual pause."
        ),
    )

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
        help_text=(
            "If set, the block is tied to this staff member. Since staff is "
            "non-binding for scheduling (see Resource), a staff-only block is "
            "informational and does NOT remove availability — set `resource` "
            "to actually block capacity."
        ),
    )
    resource = models.ForeignKey(
        "shops.Resource",
        on_delete=models.CASCADE,
        related_name="time_blocks",
        null=True,
        blank=True,
        help_text=(
            "If set, blocks only this Resource (e.g. 'Bay 1 under "
            "maintenance'). If both staff and resource are null, the block is "
            "shop-wide and removes every Resource's availability."
        ),
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
    phone = models.CharField(max_length=32, blank=True)
    email = models.EmailField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "Staff"

    def __str__(self) -> str:
        return f"{self.name} @ {self.shop.name}"


class Resource(models.Model):
    """A bookable physical capacity unit at a shop — a carwash bay, a salon
    chair, a treatment room, a table, or an abstract "slot" for shops with no
    physical station. THIS, not staff, is the binding scheduling constraint:
    a reservation holds exactly one Resource for its time range and two
    bookings can never share a Resource at overlapping times. The number of
    Resource rows at a shop IS that shop's parallel capacity (2 bays => 2
    concurrent carwashes). `Reservation.staff` is recorded for attribution
    and "request this person" only — it never gates availability. Deferred to
    a later version (deliberately, see app_ideas.md §8.17): multiple staff per
    Resource, enforced per-staff calendars. v1 is strictly 1 Resource : 1
    booking, optional non-binding staff.

    A Resource has no calendar of its own — it follows the shop's hours and
    date overrides. Mark `is_active=False` to retire one without deleting its
    booking history; inactive Resources are excluded from availability.
    """

    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name="resources")
    name = models.CharField(max_length=120)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["id"]

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
