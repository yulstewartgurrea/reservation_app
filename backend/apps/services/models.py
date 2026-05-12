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
    photo = models.ImageField(upload_to="services/", null=True, blank=True)
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


class StaffService(models.Model):
    staff = models.ForeignKey("shops.Staff", on_delete=models.CASCADE)
    service = models.ForeignKey(Service, on_delete=models.CASCADE)

    class Meta:
        unique_together = ("staff", "service")


class ServicePhoto(models.Model):
    """Gallery photo attached to a service (in addition to the legacy `Service.photo` cover)."""

    service = models.ForeignKey(Service, on_delete=models.CASCADE, related_name="gallery")
    image = models.ImageField(upload_to="services/")
    caption = models.CharField(max_length=255, blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["sort_order", "id"]
