from django.db import models


class Payment(models.Model):
    class Provider(models.TextChoices):
        PAYMONGO = "paymongo", "PayMongo"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PAID = "paid", "Paid"
        FAILED = "failed", "Failed"
        REFUNDED = "refunded", "Refunded"

    reservation = models.OneToOneField(
        "reservations.Reservation",
        on_delete=models.CASCADE,
        related_name="payment",
    )
    provider = models.CharField(max_length=16, choices=Provider.choices, default=Provider.PAYMONGO)
    provider_session_id = models.CharField(max_length=128, blank=True, db_index=True)
    checkout_url = models.URLField(blank=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3, default="PHP")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    paid_at = models.DateTimeField(null=True, blank=True)
    raw_payload = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.provider} {self.status} for reservation {self.reservation_id}"
