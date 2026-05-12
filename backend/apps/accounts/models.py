from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        SHOP_OWNER = "shop_owner", "Shop Owner"
        CUSTOMER = "customer", "Customer"

    email = models.EmailField(unique=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.CUSTOMER)
    phone = models.CharField(max_length=32, blank=True)
    avatar = models.ImageField(upload_to="avatars/", null=True, blank=True)

    no_show_count_90d = models.PositiveIntegerField(default=0)
    cancellation_strikes_90d = models.PositiveIntegerField(default=0)
    restricted_until = models.DateTimeField(null=True, blank=True)

    email_verified_at = models.DateTimeField(null=True, blank=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]

    @property
    def is_customer(self) -> bool:
        return self.role == self.Role.CUSTOMER

    @property
    def is_shop_owner(self) -> bool:
        return self.role == self.Role.SHOP_OWNER

    def __str__(self) -> str:
        return f"{self.email} ({self.role})"
