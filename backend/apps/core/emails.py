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
    try:
        text_body = render_to_string(text_template, context)
        html_body = render_to_string(html_template, context)
        msg = EmailMultiAlternatives(subject=subject, body=text_body, to=recipients)
        msg.attach_alternative(html_body, "text/html")
        msg.send()
        return True
    except Exception as exc:  # noqa: BLE001 — explicit catch-all for outbound email
        logger.warning("send_template_email failed for %s: %s", recipients, exc)
        return False
