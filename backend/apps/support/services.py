"""Business logic for the support ticketing system.

All write paths live here; views are thin transport. Every public function:

* is wrapped in `@transaction.atomic` so a ticket, its initial message, any
  attachments, and the audit event commit together (or not at all);
* writes a `TicketEvent` describing what happened, so admin debugging never
  requires diffing model rows;
* queues outbound email via Celery (deferred, never sent in the request hot
  path) so a flaky SMTP doesn't 500 a customer's ticket create.
"""

from __future__ import annotations

import logging
from typing import Iterable, Sequence

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.models import User

from .models import (
    Ticket,
    TicketAttachment,
    TicketEvent,
    TicketMessage,
)

logger = logging.getLogger("apps.support")


# Status machine. Keep the map small and explicit — the support workflow is
# the same for everyone, and we'd rather reject a typo than silently allow a
# weird transition.
#
# Notes:
#  - `awaiting_customer` is reached when an admin replies and needs more info.
#  - `resolved` is the "ticket is solved but not yet auto-closed" terminal-ish
#    state; a customer reply or admin reopen takes it back to in_progress/open.
#  - `closed` is the hard terminal. An admin can still reopen to `open`.
STATUS_TRANSITIONS: dict[str, set[str]] = {
    Ticket.Status.OPEN: {
        Ticket.Status.IN_PROGRESS,
        Ticket.Status.AWAITING_CUSTOMER,
        Ticket.Status.RESOLVED,
        Ticket.Status.CLOSED,
    },
    Ticket.Status.IN_PROGRESS: {
        Ticket.Status.OPEN,
        Ticket.Status.AWAITING_CUSTOMER,
        Ticket.Status.RESOLVED,
        Ticket.Status.CLOSED,
    },
    Ticket.Status.AWAITING_CUSTOMER: {
        Ticket.Status.OPEN,
        Ticket.Status.IN_PROGRESS,
        Ticket.Status.RESOLVED,
        Ticket.Status.CLOSED,
    },
    Ticket.Status.RESOLVED: {
        Ticket.Status.OPEN,
        Ticket.Status.IN_PROGRESS,
        Ticket.Status.CLOSED,
    },
    # `closed` is terminal. Reopening is allowed (admin only) but only back
    # to OPEN, never directly to in_progress.
    Ticket.Status.CLOSED: {
        Ticket.Status.OPEN,
    },
}


def _is_admin(user) -> bool:
    if not user or not getattr(user, "is_authenticated", False):
        return False
    return user.role == User.Role.ADMIN or user.is_superuser


def _is_participant(user, ticket: Ticket) -> bool:
    """Submitter is always a participant. Admins are participants via _is_admin.

    We deliberately don't expand "participant" to e.g. the related shop's
    owner — surfacing one user's ticket to another (even via a shared shop)
    is an information leak we'd rather not introduce.
    """
    if not user or not getattr(user, "is_authenticated", False):
        return False
    return ticket.submitter_id == user.id


@transaction.atomic
def create_ticket(
    *,
    submitter,
    category: str,
    subject: str,
    body: str,
    related_reservation=None,
    related_shop=None,
) -> Ticket:
    """Open a brand-new ticket from a customer or shop owner.

    Validates the optional context references really belong to the submitter
    so an attacker can't enumerate other people's reservations by guessing
    IDs in the `related_reservation` field.
    """
    if not subject or not subject.strip():
        raise ValidationError({"subject": "Subject is required."})
    if not body or not body.strip():
        raise ValidationError({"body": "Body is required."})
    if category not in Ticket.Category.values:
        raise ValidationError({"category": "Invalid category."})

    if related_reservation is not None:
        owns_as_customer = (
            related_reservation.customer_id == submitter.id
        )
        owns_as_shop_owner = (
            related_reservation.shop is not None
            and related_reservation.shop.owner_id == submitter.id
        )
        if not (owns_as_customer or owns_as_shop_owner):
            # Same shape as "not found" to avoid leaking the existence of
            # someone else's reservation by ID guessing.
            raise ValidationError(
                {"related_reservation": "Reservation not found."}
            )

    if related_shop is not None:
        # A customer can attach any shop (e.g. complaining about it); a shop
        # owner attaching a shop they don't own is suspicious and likely a
        # client bug — reject it.
        if submitter.is_shop_owner and related_shop.owner_id != submitter.id:
            raise ValidationError(
                {"related_shop": "You do not own this shop."}
            )

    now = timezone.now()
    ticket = Ticket.objects.create(
        submitter=submitter,
        category=category,
        subject=subject.strip(),
        body=body.strip(),
        related_reservation=related_reservation,
        related_shop=related_shop,
        last_message_at=now,
    )

    TicketEvent.objects.create(
        ticket=ticket,
        actor=submitter,
        event_type=TicketEvent.EventType.CREATED,
        payload={"category": category, "priority": ticket.priority},
    )

    logger.info(
        "support.create_ticket ticket_id=%s actor_id=%s category=%s",
        ticket.id,
        submitter.id,
        category,
    )

    # Defer email sends so the API call returns fast and a flaky SMTP
    # doesn't bubble up as a 500 to the submitter.
    from .tasks import (
        email_ticket_created_admin,
        email_ticket_created_customer,
    )

    transaction.on_commit(
        lambda: email_ticket_created_customer.delay(ticket.id)
    )
    transaction.on_commit(
        lambda: email_ticket_created_admin.delay(ticket.id)
    )

    return ticket


@transaction.atomic
def add_message(
    *,
    ticket: Ticket,
    author,
    body: str,
    is_internal: bool = False,
    attachment_files: Sequence | None = None,
) -> TicketMessage:
    """Append a reply to an existing ticket.

    Defense-in-depth: even if a view forgets the role check, a non-admin
    author can never produce an internal note. The view layer is the
    *first* line; this is the last.

    Attachments are persisted inside the same transaction — a partial
    success (message saved, attachments lost) would be very confusing for
    the customer.
    """
    if not body or not body.strip():
        raise ValidationError({"body": "Message body is required."})

    if not (_is_participant(author, ticket) or _is_admin(author)):
        raise ValidationError("You are not a participant of this ticket.")

    actor_is_admin = _is_admin(author)
    # Non-admins NEVER write internal notes, even if they manage to set the
    # flag in their request payload. Single source of truth, here.
    effective_internal = bool(is_internal) and actor_is_admin

    message = TicketMessage.objects.create(
        ticket=ticket,
        author=author,
        body=body.strip(),
        is_internal=effective_internal,
    )

    if attachment_files:
        for f in attachment_files:
            attachment = TicketAttachment.objects.create(
                message=message,
                file=f,
                original_name=getattr(f, "name", "") or "attachment",
                content_type=getattr(f, "content_type", "") or "",
                size=getattr(f, "size", 0) or 0,
            )
            TicketEvent.objects.create(
                ticket=ticket,
                actor=author,
                event_type=TicketEvent.EventType.ATTACHMENT_ADDED,
                payload={
                    "message_id": message.id,
                    "attachment_id": attachment.id,
                    "original_name": attachment.original_name,
                },
            )

    # Public messages always bump the activity timestamp so the ticket
    # floats up in list views. Internal notes don't — they're admin-private
    # and shouldn't move a ticket up the customer-facing queue ordering
    # (the queue is the same model field, but conceptually a private note
    # isn't "new activity for the user").
    if not effective_internal:
        ticket.last_message_at = timezone.now()
        # If a customer replies while we're awaiting them, flip back to
        # in_progress so an admin sees it in their work queue.
        if (
            not actor_is_admin
            and ticket.status == Ticket.Status.AWAITING_CUSTOMER
        ):
            old = ticket.status
            ticket.status = Ticket.Status.IN_PROGRESS
            ticket.save(update_fields=["last_message_at", "status", "updated_at"])
            TicketEvent.objects.create(
                ticket=ticket,
                actor=author,
                event_type=TicketEvent.EventType.STATUS_CHANGED,
                payload={"from": old, "to": ticket.status, "reason": "customer reply"},
            )
        else:
            ticket.save(update_fields=["last_message_at", "updated_at"])

    TicketEvent.objects.create(
        ticket=ticket,
        actor=author,
        event_type=TicketEvent.EventType.MESSAGE_ADDED,
        payload={"message_id": message.id, "is_internal": effective_internal},
    )

    logger.info(
        "support.add_message ticket_id=%s actor_id=%s msg_id=%s internal=%s",
        ticket.id,
        getattr(author, "id", None),
        message.id,
        effective_internal,
    )

    # Notify the OTHER party. Internal notes don't email anyone — they're
    # admin scratch space. Email send is deferred to commit so we never
    # email about a message that ultimately rolls back.
    if not effective_internal:
        from .tasks import email_ticket_replied

        msg_id = message.id
        t_id = ticket.id
        transaction.on_commit(
            lambda: email_ticket_replied.delay(t_id, msg_id)
        )

    return message


@transaction.atomic
def transition_status(*, ticket: Ticket, new_status: str, actor) -> Ticket:
    """Move a ticket through its status machine.

    Only admins call this — view layer enforces the role. We still validate
    `actor` is an admin here for defense-in-depth.
    """
    if not _is_admin(actor):
        raise ValidationError("Only admins can change ticket status.")
    if new_status not in Ticket.Status.values:
        raise ValidationError({"new_status": "Invalid status."})

    old = ticket.status
    if new_status == old:
        return ticket

    allowed = STATUS_TRANSITIONS.get(old, set())
    if new_status not in allowed:
        raise ValidationError(
            f"Cannot transition from {old} to {new_status}."
        )

    ticket.status = new_status
    if new_status == Ticket.Status.RESOLVED:
        ticket.resolved_at = timezone.now()
    elif old == Ticket.Status.RESOLVED:
        # Leaving resolved (reopen or close) clears the resolved marker so
        # the field always reflects the *current* resolved instant, not a
        # stale one from an earlier resolution.
        ticket.resolved_at = None
    ticket.save(update_fields=["status", "resolved_at", "updated_at"])

    TicketEvent.objects.create(
        ticket=ticket,
        actor=actor,
        event_type=TicketEvent.EventType.STATUS_CHANGED,
        payload={"from": old, "to": new_status},
    )

    logger.info(
        "support.transition_status ticket_id=%s actor_id=%s %s->%s",
        ticket.id,
        actor.id,
        old,
        new_status,
    )

    from .tasks import email_ticket_status_changed

    t_id = ticket.id
    transaction.on_commit(
        lambda: email_ticket_status_changed.delay(t_id, old, new_status)
    )

    return ticket


@transaction.atomic
def assign_ticket(*, ticket: Ticket, assignee, actor) -> Ticket:
    """Set or clear the assigned admin.

    Pass `assignee=None` to unassign. Only admins can perform assignments,
    and only admins may BE assignees — assigning a customer to handle their
    own ticket would be nonsensical.
    """
    if not _is_admin(actor):
        raise ValidationError("Only admins can assign tickets.")
    if assignee is not None and not _is_admin(assignee):
        raise ValidationError({"assignee_id": "Assignee must be an admin."})

    old_id = ticket.assigned_to_id
    new_id = assignee.id if assignee is not None else None
    if old_id == new_id:
        return ticket

    ticket.assigned_to = assignee
    ticket.save(update_fields=["assigned_to", "updated_at"])

    TicketEvent.objects.create(
        ticket=ticket,
        actor=actor,
        event_type=TicketEvent.EventType.ASSIGNED,
        payload={"from_id": old_id, "to_id": new_id},
    )

    logger.info(
        "support.assign_ticket ticket_id=%s actor_id=%s assignee_id=%s",
        ticket.id,
        actor.id,
        new_id,
    )
    return ticket


@transaction.atomic
def change_priority(*, ticket: Ticket, new_priority: str, actor) -> Ticket:
    """Bump (or lower) ticket priority. Admins only."""
    if not _is_admin(actor):
        raise ValidationError("Only admins can change ticket priority.")
    if new_priority not in Ticket.Priority.values:
        raise ValidationError({"new_priority": "Invalid priority."})

    old = ticket.priority
    if old == new_priority:
        return ticket

    ticket.priority = new_priority
    ticket.save(update_fields=["priority", "updated_at"])

    TicketEvent.objects.create(
        ticket=ticket,
        actor=actor,
        event_type=TicketEvent.EventType.PRIORITY_CHANGED,
        payload={"from": old, "to": new_priority},
    )

    logger.info(
        "support.change_priority ticket_id=%s actor_id=%s %s->%s",
        ticket.id,
        actor.id,
        old,
        new_priority,
    )
    return ticket


def admin_recipients() -> Iterable[str]:
    """All admin email addresses for fan-out notifications.

    Returns a list (not a queryset) so the caller can `bool()` it or join it
    safely. Filters out blank emails — a misconfigured admin shouldn't crash
    the task.
    """
    return list(
        User.objects.filter(role=User.Role.ADMIN, is_active=True)
        .exclude(email="")
        .values_list("email", flat=True)
    )
