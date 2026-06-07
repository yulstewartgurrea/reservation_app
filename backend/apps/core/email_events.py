"""React to delivery events reported by the email provider (Resend via Anymail).

Anymail normalises every ESP's webhook into a single `tracking` signal, and its
webhook view verifies the provider's signature for us (Resend signs with Svix —
see ANYMAIL["RESEND_SIGNING_SECRET"]). So all we own here is the reaction: when
an address hard-bounces or the recipient marks us as spam, flag the matching
User so `send_template_email` stops mailing it. Re-mailing dead/complaining
addresses is what wrecks sender reputation.

Registered from CoreConfig.ready().
"""

from __future__ import annotations

import logging

from anymail.signals import tracking
from django.contrib.auth import get_user_model
from django.dispatch import receiver

logger = logging.getLogger(__name__)

# Events that mean "never send here again". Transient soft-bounces (a full
# mailbox, a momentary defer) are intentionally excluded — those recover.
SUPPRESSING_EVENTS = frozenset({"bounced", "complained", "rejected"})


@receiver(tracking)
def suppress_on_bounce(sender, event, esp_name, **kwargs) -> None:
    """Flag the recipient User on a hard bounce or spam complaint."""
    if event.event_type not in SUPPRESSING_EVENTS:
        return

    recipient = (event.recipient or "").strip()
    if not recipient:
        return

    User = get_user_model()
    updated = User.objects.filter(email__iexact=recipient, email_bounced=False).update(
        email_bounced=True
    )
    if updated:
        logger.warning(
            "email suppressed recipient=%s event=%s esp=%s", recipient, event.event_type, esp_name
        )
    else:
        # No matching active User (e.g. an admin/ops address, or already flagged).
        # Still worth a log line so bounces to non-user addresses are visible.
        logger.info(
            "email event for non-user/known recipient=%s event=%s esp=%s",
            recipient,
            event.event_type,
            esp_name,
        )
