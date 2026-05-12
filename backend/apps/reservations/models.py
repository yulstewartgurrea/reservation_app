from django.conf import settings
from django.db import models


class Reservation(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        CONFIRMED = "confirmed", "Confirmed"
        COMPLETED = "completed", "Completed"
        CANCELLED_BY_CUSTOMER = "cancelled_by_customer", "Cancelled by customer"
        CANCELLED_BY_SHOP = "cancelled_by_shop", "Cancelled by shop"
        NO_SHOW = "no_show", "No show"

    class Source(models.TextChoices):
        ONLINE = "online", "Online"
        WALK_IN = "walk_in", "Walk-in"

    class PaymentMethod(models.TextChoices):
        PAY_ON_ARRIVAL = "pay_on_arrival", "Pay on arrival"
        ONLINE = "online", "Online (PayMongo)"

    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reservations",
    )
    shop = models.ForeignKey(
        "shops.Shop", on_delete=models.CASCADE, related_name="reservations"
    )
    service = models.ForeignKey(
        "services.Service", on_delete=models.PROTECT, related_name="reservations"
    )
    staff = models.ForeignKey(
        "shops.Staff",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reservations",
    )

    start_at = models.DateTimeField()
    end_at = models.DateTimeField()

    status = models.CharField(max_length=32, choices=Status.choices, default=Status.PENDING)
    source = models.CharField(max_length=16, choices=Source.choices, default=Source.ONLINE)
    payment_method = models.CharField(
        max_length=32, choices=PaymentMethod.choices, default=PaymentMethod.PAY_ON_ARRIVAL
    )

    total_price = models.DecimalField(max_digits=10, decimal_places=2)
    commission_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    created_by_shop = models.BooleanField(default=False)
    guest_name = models.CharField(max_length=120, blank=True)
    guest_phone = models.CharField(max_length=32, blank=True)

    customer_notes = models.TextField(blank=True)
    shop_notes = models.TextField(blank=True, help_text="Internal notes, not shown to customer.")

    cancellation_reason = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-start_at"]
        indexes = [
            models.Index(fields=["shop", "start_at"]),
            models.Index(fields=["customer", "start_at"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self) -> str:
        who = self.customer.email if self.customer else self.guest_name or "guest"
        return f"{who} → {self.shop.name} @ {self.start_at:%Y-%m-%d %H:%M}"


class ReservationStatusHistory(models.Model):
    reservation = models.ForeignKey(
        Reservation, on_delete=models.CASCADE, related_name="status_history"
    )
    from_status = models.CharField(max_length=32)
    to_status = models.CharField(max_length=32)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    reason = models.TextField(blank=True)
    changed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-changed_at"]


class CommissionLedger(models.Model):
    """Tracks platform commission owed per completed reservation.

    Settled off-platform via invoice in v1 (no online payments).
    """

    shop = models.ForeignKey(
        "shops.Shop", on_delete=models.CASCADE, related_name="commission_entries"
    )
    reservation = models.OneToOneField(
        Reservation, on_delete=models.CASCADE, related_name="commission_entry"
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    rate = models.DecimalField(max_digits=5, decimal_places=4)
    period = models.CharField(max_length=7, help_text="YYYY-MM")
    settled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["shop", "period"])]
