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
    # The binding scheduling unit. Exactly one Resource is held for [start_at,
    # end_at + buffer); two reservations can never share a Resource at
    # overlapping times. Nullable only so the migration can backfill existing
    # rows before flipping it required — always set in practice. See
    # shops.Resource.
    resource = models.ForeignKey(
        "shops.Resource",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="reservations",
    )
    # Optional, NON-binding. Recorded for attribution ("who did this job") and
    # to honour a customer's "I'd prefer Juan" request. The scheduling engine
    # ignores it entirely: the same staff may appear on two overlapping
    # reservations and that is not a conflict. Capacity is governed by
    # `resource`, never by staff.
    staff = models.ForeignKey(
        "shops.Staff",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reservations",
    )

    start_at = models.DateTimeField()
    end_at = models.DateTimeField()

    quantity = models.PositiveIntegerField(default=1)

    status = models.CharField(max_length=32, choices=Status.choices, default=Status.PENDING)
    source = models.CharField(max_length=16, choices=Source.choices, default=Source.ONLINE)
    payment_method = models.CharField(
        max_length=32, choices=PaymentMethod.choices, default=PaymentMethod.PAY_ON_ARRIVAL
    )

    unit_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text=(
            "Price per unit frozen at booking time. The reservation's price is "
            "snapshotted here so later Service.price changes never alter an "
            "existing booking (keeps commission/revenue historically correct). "
            "Invariant: total_price == (unit_price * quantity).quantize('0.01')."
        ),
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


class CommissionInvoice(models.Model):
    """One uniform monthly invoice per shop covering ALL its commission for a
    period (YYYY-MM).

    The platform collects commission off-platform; this invoice is how a shop
    is billed. It is paid via a PayMongo payment link or marked settled offline
    by an admin (bank / GCash). Generation is idempotent: re-running for a
    period updates an existing *open* invoice's amount and never touches a
    paid/void one (no double-charge).
    """

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        PAID = "paid", "Paid"
        VOID = "void", "Void"

    shop = models.ForeignKey(
        "shops.Shop", on_delete=models.CASCADE, related_name="commission_invoices"
    )
    period = models.CharField(max_length=7, help_text="YYYY-MM")
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(
        max_length=8, choices=Status.choices, default=Status.OPEN
    )
    issued_at = models.DateTimeField(auto_now_add=True)
    due_date = models.DateField()
    paid_at = models.DateTimeField(null=True, blank=True)
    settled_offline = models.BooleanField(default=False)
    paymongo_session_id = models.CharField(max_length=128, blank=True)
    payment_url = models.URLField(blank=True)
    raw_payload = models.JSONField(null=True, blank=True)
    # Last time an overdue/due reminder was sent, so the daily scanner doesn't
    # spam the owner every run.
    last_reminded_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-period", "shop_id"]
        unique_together = ("shop", "period")
        indexes = [models.Index(fields=["shop", "status"])]

    def __str__(self) -> str:
        return f"Commission {self.period} — {self.shop.name} (₱{self.amount}, {self.status})"


class ReservationReminder(models.Model):
    """One row per reminder actually dispatched for a reservation.

    The unique (reservation, offset) constraint makes the periodic Beat
    scanner idempotent: a reminder for a given lead time is sent exactly
    once even though the scan window overlaps several Beat ticks.
    """

    class Offset(models.TextChoices):
        DAY = "24h", "24 hours before"
        HOUR = "1h", "1 hour before"

    reservation = models.ForeignKey(
        Reservation, on_delete=models.CASCADE, related_name="reminders"
    )
    offset = models.CharField(max_length=4, choices=Offset.choices)
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("reservation", "offset")
        ordering = ["-sent_at"]
