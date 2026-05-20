from django.conf import settings
from django.db import models


class Notification(models.Model):
    class Kind(models.TextChoices):
        BOOKING_NEW = "booking_new", "New booking"
        BOOKING_CONFIRMED = "booking_confirmed", "Booking confirmed"
        BOOKING_CANCELLED = "booking_cancelled", "Booking cancelled"
        BOOKING_COMPLETED = "booking_completed", "Booking completed"
        BOOKING_NO_SHOW = "booking_no_show", "Marked no-show"
        REMINDER = "reminder", "Reminder"
        CHAT_NEW_MESSAGE = "chat.new_message", "New chat message"
        COMMISSION_INVOICE_ISSUED = "commission_invoice_issued", "Commission invoice issued"
        COMMISSION_INVOICE_PAID = "commission_invoice_paid", "Commission invoice paid"
        COMMISSION_INVOICE_OVERDUE = "commission_invoice_overdue", "Commission invoice overdue"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    kind = models.CharField(max_length=32, choices=Kind.choices)
    title = models.CharField(max_length=255)
    body = models.TextField(blank=True)
    payload = models.JSONField(default=dict, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "read_at"])]

    def __str__(self) -> str:
        return f"{self.kind} → {self.user.email}"


class MaintenanceReminder(models.Model):
    """A scheduled reminder a shop owner sets for a past customer.

    Example: a car-wash shop reminds a customer every 6 months that their
    aircon is due for cleaning. When `next_due_at` passes, the dispatcher
    sends an email + in-app notification and rolls `next_due_at` forward
    by `interval_months`.
    """

    shop = models.ForeignKey(
        "shops.Shop", on_delete=models.CASCADE, related_name="maintenance_reminders"
    )
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="maintenance_reminders",
    )
    service = models.ForeignKey(
        "services.Service",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="maintenance_reminders",
    )
    title = models.CharField(max_length=120, help_text="Short label, e.g. 'Aircon cleaning'")
    message = models.TextField(blank=True, help_text="Optional custom note to include in the email.")
    interval_months = models.PositiveSmallIntegerField(default=6)
    next_due_at = models.DateTimeField()
    last_sent_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="maintenance_reminders_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["next_due_at"]
        indexes = [
            models.Index(fields=["shop", "is_active"]),
            models.Index(fields=["next_due_at", "is_active"]),
        ]

    def __str__(self) -> str:
        return f"{self.title} → {self.customer.email} ({self.next_due_at:%Y-%m-%d})"
