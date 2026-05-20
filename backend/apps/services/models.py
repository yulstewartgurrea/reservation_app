from django.conf import settings
from django.db import models


class ServiceCategory(models.Model):
    name = models.CharField(max_length=64, unique=True)
    slug = models.SlugField(unique=True)

    class Meta:
        verbose_name_plural = "Service categories"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Service(models.Model):
    shop = models.ForeignKey("shops.Shop", on_delete=models.CASCADE, related_name="services")
    category = models.ForeignKey(
        ServiceCategory, on_delete=models.SET_NULL, null=True, blank=True, related_name="services"
    )
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    duration_minutes = models.PositiveIntegerField()
    buffer_minutes = models.PositiveIntegerField(default=0, help_text="Padding after the service.")
    price = models.DecimalField(max_digits=10, decimal_places=2)
    max_quantity = models.PositiveIntegerField(
        default=1,
        help_text="Max units a customer can book in one reservation. 1 = quantity not offered.",
    )
    unit_label = models.CharField(max_length=20, default="unit")
    inter_unit_buffer_minutes = models.PositiveIntegerField(
        default=0,
        help_text=(
            "Gap between units for multi-unit bookings (e.g. travel/reset "
            "between each aircon). Not applied for single-unit bookings or "
            "after the last unit."
        ),
    )
    is_active = models.BooleanField(default=True)

    eligible_staff = models.ManyToManyField(
        "shops.Staff",
        through="StaffService",
        related_name="services",
        blank=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.shop.name})"

    @property
    def total_block_minutes(self) -> int:
        return self.duration_minutes + self.buffer_minutes


class ServicePriceHistory(models.Model):
    """Append-only audit trail of every Service.price change.

    Written by `apps.services.services.update_service` (service layer, not a
    signal) whenever the persisted price actually changes. Existing bookings
    are unaffected because each Reservation snapshots its own `unit_price`;
    this table is the human-facing record of *what changed, when, by whom*.
    """

    service = models.ForeignKey(
        Service, on_delete=models.CASCADE, related_name="price_history"
    )
    old_price = models.DecimalField(max_digits=10, decimal_places=2)
    new_price = models.DecimalField(max_digits=10, decimal_places=2)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="service_price_changes",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.service.name}: {self.old_price} → {self.new_price}"


class StaffService(models.Model):
    staff = models.ForeignKey("shops.Staff", on_delete=models.CASCADE)
    service = models.ForeignKey(Service, on_delete=models.CASCADE)

    class Meta:
        unique_together = ("staff", "service")


class ServicePhoto(models.Model):
    """Photo in a service's gallery. Exactly one row per service may be primary —
    that's the image surfaced as the service's cover on cards and listings."""

    service = models.ForeignKey(Service, on_delete=models.CASCADE, related_name="gallery")
    image = models.ImageField(upload_to="services/")
    caption = models.CharField(max_length=255, blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    is_primary = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-is_primary", "sort_order", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["service"],
                condition=models.Q(is_primary=True),
                name="unique_primary_photo_per_service",
            ),
        ]
