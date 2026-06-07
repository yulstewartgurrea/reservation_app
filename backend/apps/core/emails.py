"""Shared email helpers.

One place that knows how to render an HTML+text template pair, attach the right
MIME parts, and send. Everything else just calls `send_template_email`.
"""

from __future__ import annotations

import logging
from typing import Iterable

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

logger = logging.getLogger(__name__)


# Where the React app lives — used to build absolute links inside emails.
def get_frontend_url() -> str:
    return getattr(settings, "FRONTEND_URL", "http://localhost:3000")


def _drop_suppressed(recipients: list[str]) -> list[str]:
    """Remove addresses flagged as bounced/complained (see apps.core.email_events).

    Only addresses that map to a flagged User are dropped; unknown addresses
    (ops/admin recipients with no User row) always pass through. Imported lazily
    via get_user_model so this module stays importable during app loading.
    """
    from django.contrib.auth import get_user_model

    User = get_user_model()
    suppressed = set(
        User.objects.filter(email__in=recipients, email_bounced=True).values_list(
            "email", flat=True
        )
    )
    if not suppressed:
        return recipients
    kept = [r for r in recipients if r not in suppressed]
    logger.info("send_template_email suppressed=%s", sorted(suppressed))
    return kept


def send_template_email(
    *,
    to: str | Iterable[str],
    subject: str,
    text_template: str,
    html_template: str,
    context: dict,
) -> bool:
    """Render an HTML/text email pair from templates and send.

    Returns True if Django's send call succeeded; False otherwise.
    Never raises — callers shouldn't have to wrap this.
    """
    recipients = [to] if isinstance(to, str) else list(to)
    recipients = _drop_suppressed(recipients)
    if not recipients:
        logger.info("send_template_email skipped (all recipients suppressed) subject=%r", subject)
        return False
    try:
        text_body = render_to_string(text_template, context)
        html_body = render_to_string(html_template, context)
        msg = EmailMultiAlternatives(subject=subject, body=text_body, to=recipients)
        msg.attach_alternative(html_body, "text/html")
        sent = msg.send()
        if sent:
            logger.info("send_template_email ok to=%s subject=%r", recipients, subject)
            return True
        logger.warning("send_template_email returned 0 to=%s subject=%r", recipients, subject)
        return False
    except Exception as exc:  # noqa: BLE001 — explicit catch-all for outbound email
        logger.warning("send_template_email failed to=%s subject=%r err=%s", recipients, subject, exc)
        return False
