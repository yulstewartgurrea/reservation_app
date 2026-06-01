"""Support ticketing models.

A `Ticket` is a conversation between a user (customer or shop owner) and the
platform's admins. Each ticket carries an audit trail of `TicketEvent` rows
(status changes, assignments, replies) so admin debugging is straightforward,
and a thread of `TicketMessage` rows. Messages may have file attachments
(images/PDFs) and may be flagged `is_internal` so admins can keep notes
invisible to the submitter.

Hot path is `Ticket.objects.filter(...).order_by("-last_message_at")` for
list views, plus per-ticket message reads — indexes are sized accordingly.
"""

from __future__ import annotations

import os
import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


def ticket_attachment_path(instance: "TicketAttachment", filename: str) -> str:
    """Generate `tickets/<yyyy>/<mm>/<uuid><ext>` keys.

    The original filename is preserved only on `TicketAttachment.original_name`
    for display; it never reaches the storage layer. This sidesteps every
    class of filename-based exploit (path traversal, executable names, NUL
    bytes, locale-specific case clashes on case-insensitive backends) and
    guarantees object keys never collide.
    """
    now = timezone.now()
    _, ext = os.path.splitext(filename or "")
    ext = ext.lower()
    return f"tickets/{now:%Y}/{now:%m}/{uuid.uuid4().hex}{ext}"


class Ticket(models.Model):
    class Category(models.TextChoices):
        BUG = "bug", "Bug report"
        PAYMENT = "payment", "Payment"
        BOOKING = "booking", "Booking"
        SHOP = "shop", "Shop"
        ACCOUNT = "account", "Account"
        FEATURE = "feature", "Feature request"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        IN_PROGRESS = "in_progress", "In progress"
        AWAITING_CUSTOMER = "awaiting_customer", "Awaiting customer"
        RESOLVED = "resolved", "Resolved"
        CLOSED = "closed", "Closed"

    class Priority(models.TextChoices):
        LOW = "low", "Low"
        NORMAL = "normal", "Normal"
        HIGH = "high", "High"
        URGENT = "urgent", "Urgent"

    submitter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="tickets_submitted",
    )
    category = models.CharField(
        max_length=16, choices=Category.choices, default=Category.OTHER
    )
    subject = models.CharField(max_length=200)
    body = models.TextField()
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.OPEN
    )
    priority = models.CharField(
        max_length=8, choices=Priority.choices, default=Priority.NORMAL
    )

    # Optional context — set null on delete so a deleted reservation/shop
    # doesn't cascade-wipe the support history.
    related_reservation = models.ForeignKey(
        "reservations.Reservation",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="support_tickets",
    )
    related_shop = models.ForeignKey(
        "shops.Shop",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="support_tickets",
    )

    # Admin handling. We don't enforce `assignee.role=admin` at the DB layer
    # because the User table can hold deleted/demoted accounts; the service
    # layer validates at write time.
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="tickets_assigned",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    # Drives list ordering. Bumped by `services.add_message` whenever either
    # party replies so the most recently active ticket floats to the top
    # without forcing a JOIN/aggregate on every list request.
    last_message_at = models.DateTimeField(default=timezone.now)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-last_message_at"]
        indexes = [
            models.Index(fields=["submitter", "-created_at"]),
            models.Index(fields=["status", "-created_at"]),
            models.Index(fields=["assigned_to", "status"]),
        ]

    def __str__(self) -> str:
        return f"#{self.pk} {self.subject} ({self.status})"


class TicketMessage(models.Model):
    ticket = models.ForeignKey(
        Ticket, on_delete=models.CASCADE, related_name="messages"
    )
    # SET_NULL so that closing a user account doesn't erase the conversation
    # history admins may need for compliance/audit.
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="ticket_messages",
    )
    body = models.TextField()
    # Admin-only private note. The viewset MUST filter this out for non-admin
    # querysets — there is also a service-layer defense that forces False
    # when the author is not an admin so a bug in one layer can't leak.
    is_internal = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [models.Index(fields=["ticket", "created_at"])]

    def __str__(self) -> str:
        who = self.author.email if self.author_id else "deleted user"
        marker = " (internal)" if self.is_internal else ""
        return f"msg {self.pk} on ticket {self.ticket_id} by {who}{marker}"


class TicketAttachment(models.Model):
    message = models.ForeignKey(
        TicketMessage, on_delete=models.CASCADE, related_name="attachments"
    )
    file = models.FileField(upload_to=ticket_attachment_path)
    # Preserved for display only; never used to build the storage key.
    original_name = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100)
    size = models.PositiveIntegerField()
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"attachment {self.pk}: {self.original_name}"


class TicketEvent(models.Model):
    """Audit log of every state-changing action on a ticket.

    Lets an admin reconstruct what happened (and when, and by whom) without
    parsing the message thread. Cheap to write, fast to query — `ticket,
    -created_at` index makes the detail-page sidebar cheap.
    """

    class EventType(models.TextChoices):
        CREATED = "created", "Created"
        STATUS_CHANGED = "status_changed", "Status changed"
        ASSIGNED = "assigned", "Assigned"
        PRIORITY_CHANGED = "priority_changed", "Priority changed"
        MESSAGE_ADDED = "message_added", "Message added"
        ATTACHMENT_ADDED = "attachment_added", "Attachment added"

    ticket = models.ForeignKey(
        Ticket, on_delete=models.CASCADE, related_name="events"
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="ticket_events",
    )
    event_type = models.CharField(max_length=20, choices=EventType.choices)
    # Free-form metadata. Examples:
    #   {"from": "open", "to": "in_progress"}
    #   {"message_id": 42, "is_internal": true}
    #   {"assignee_id": 5}
    payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["ticket", "-created_at"])]

    def __str__(self) -> str:
        return f"event {self.event_type} on ticket {self.ticket_id}"
