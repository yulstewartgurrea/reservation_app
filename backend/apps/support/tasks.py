"""Celery tasks for the support module.

Each task fetches the ticket with `select_related`, no-ops gracefully if the
ticket vanished between enqueue and execution, and catches its own exceptions
so a transient SMTP failure doesn't poison the queue.
"""

from __future__ import annotations

import logging

from celery import shared_task

from apps.core.emails import get_frontend_url, send_template_email

from .models import Ticket, TicketMessage

logger = logging.getLogger("apps.support")


def _ticket_link(ticket_id: int) -> str:
    return f"{get_frontend_url()}/support/{ticket_id}"


def _display_name(user) -> str:
    if not user:
        return "a user"
    return (
        user.first_name
        or user.username
        or (user.email.split("@")[0] if user.email else "a user")
    )


def _load_ticket(ticket_id: int) -> Ticket | None:
    try:
        return Ticket.objects.select_related(
            "submitter", "assigned_to", "related_shop", "related_reservation"
        ).get(pk=ticket_id)
    except Ticket.DoesNotExist:
        logger.info("support.task ticket_id=%s no longer exists", ticket_id)
        return None


@shared_task
def email_ticket_created_customer(ticket_id: int) -> str:
    ticket = _load_ticket(ticket_id)
    if ticket is None:
        return f"ticket {ticket_id} missing"
    submitter = ticket.submitter
    if not submitter or not submitter.email:
        return f"ticket {ticket_id}: no submitter email"

    try:
        sent = send_template_email(
            to=submitter.email,
            subject=f"We received your ticket #{ticket.id}",
            text_template="emails/ticket_created_customer.txt",
            html_template="emails/ticket_created_customer.html",
            context={
                "user_name": _display_name(submitter),
                "ticket": ticket,
                "ticket_url": _ticket_link(ticket.id),
            },
        )
    except Exception as exc:  # noqa: BLE001 — never let an email failure poison the queue
        logger.warning(
            "support.email_ticket_created_customer ticket_id=%s err=%s",
            ticket_id,
            exc,
        )
        return f"ticket {ticket_id}: send raised {exc}"
    return f"created_customer({ticket_id}): sent={bool(sent)}"


@shared_task
def email_ticket_created_admin(ticket_id: int) -> str:
    ticket = _load_ticket(ticket_id)
    if ticket is None:
        return f"ticket {ticket_id} missing"

    from .services import admin_recipients

    recipients = admin_recipients()
    if not recipients:
        return f"ticket {ticket_id}: no admin recipients"

    try:
        sent = send_template_email(
            to=recipients,
            subject=f"New ticket #{ticket.id} from {_display_name(ticket.submitter)}",
            text_template="emails/ticket_created_admin.txt",
            html_template="emails/ticket_created_admin.html",
            context={
                "ticket": ticket,
                "submitter_name": _display_name(ticket.submitter),
                "ticket_url": _ticket_link(ticket.id),
            },
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "support.email_ticket_created_admin ticket_id=%s err=%s",
            ticket_id,
            exc,
        )
        return f"ticket {ticket_id}: send raised {exc}"
    return f"created_admin({ticket_id}): sent={bool(sent)} n={len(recipients)}"


@shared_task
def email_ticket_replied(ticket_id: int, message_id: int) -> str:
    ticket = _load_ticket(ticket_id)
    if ticket is None:
        return f"ticket {ticket_id} missing"
    try:
        message = TicketMessage.objects.select_related("author").get(pk=message_id)
    except TicketMessage.DoesNotExist:
        return f"message {message_id} missing"

    # Hard guard: never email about an internal note. The service layer
    # already skips queuing in that case, but a task replay or manual
    # invocation could still arrive here for an internal message.
    if message.is_internal:
        return f"message {message_id} is internal — skipping email"

    author = message.author
    author_is_admin = bool(
        author
        and (author.role == "admin" or author.is_superuser)
    )

    # Pick the recipient = "the other party".
    if author_is_admin:
        # Admin replied → email the submitter.
        if not ticket.submitter or not ticket.submitter.email:
            return f"ticket {ticket_id}: no submitter email"
        to = ticket.submitter.email
        recipient_name = _display_name(ticket.submitter)
    else:
        # Submitter replied → fan out to admins.
        from .services import admin_recipients

        to = admin_recipients()
        if not to:
            return f"ticket {ticket_id}: no admin recipients"
        recipient_name = "team"

    try:
        sent = send_template_email(
            to=to,
            subject=f"New reply on ticket #{ticket.id}",
            text_template="emails/ticket_replied.txt",
            html_template="emails/ticket_replied.html",
            context={
                "ticket": ticket,
                "message": message,
                "author_name": _display_name(author),
                "recipient_name": recipient_name,
                "ticket_url": _ticket_link(ticket.id),
            },
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "support.email_ticket_replied ticket_id=%s msg=%s err=%s",
            ticket_id,
            message_id,
            exc,
        )
        return f"ticket {ticket_id}: send raised {exc}"
    return f"replied({ticket_id}, msg={message_id}): sent={bool(sent)}"


@shared_task
def email_ticket_status_changed(
    ticket_id: int, old_status: str, new_status: str
) -> str:
    ticket = _load_ticket(ticket_id)
    if ticket is None:
        return f"ticket {ticket_id} missing"
    submitter = ticket.submitter
    if not submitter or not submitter.email:
        return f"ticket {ticket_id}: no submitter email"

    try:
        sent = send_template_email(
            to=submitter.email,
            subject=f"Ticket #{ticket.id} is now {ticket.get_status_display()}",
            text_template="emails/ticket_status_changed.txt",
            html_template="emails/ticket_status_changed.html",
            context={
                "user_name": _display_name(submitter),
                "ticket": ticket,
                "old_status": old_status,
                "new_status": new_status,
                "new_status_label": ticket.get_status_display(),
                "ticket_url": _ticket_link(ticket.id),
            },
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "support.email_ticket_status_changed ticket_id=%s err=%s",
            ticket_id,
            exc,
        )
        return f"ticket {ticket_id}: send raised {exc}"
    return (
        f"status_changed({ticket_id}, {old_status}->{new_status}): "
        f"sent={bool(sent)}"
    )
