from django.conf import settings
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

    last_seen_at = models.DateTimeField(null=True, blank=True)

    # Set when the email provider reports a hard bounce or spam complaint for
    # this address (see apps.core.email_events). Suppressed in send_template_email
    # so we stop mailing dead/complaining addresses and protect sender reputation.
    email_bounced = models.BooleanField(default=False)

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


class EmailOTP(models.Model):
    """One-time 6-digit code emailed for account verification.

    The plaintext code is never stored — only a hashed form. Codes are valid
    for ~10 minutes, with a small attempt cap to slow brute-force.
    """

    class Purpose(models.TextChoices):
        SIGNUP = "signup", "Signup verification"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="email_otps",
    )
    purpose = models.CharField(max_length=16, choices=Purpose.choices, default=Purpose.SIGNUP)
    code_hash = models.CharField(max_length=128)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "purpose", "consumed_at"])]
