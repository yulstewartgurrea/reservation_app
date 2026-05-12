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
