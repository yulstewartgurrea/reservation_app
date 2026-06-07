"""Resend / Anymail integration: bounce-driven suppression of dead addresses.

Covers the two halves of the feature independently:
  - the `tracking`-signal receiver that flags a bounced/complaining User, and
  - `send_template_email` honouring that flag.

The receiver is exercised by firing Anymail's `tracking` signal directly with a
constructed event. That's the unit under test — the HTTP webhook view and its
Svix signature check are Anymail's code, not ours, so we don't re-test them here.
"""

from __future__ import annotations

from anymail.signals import AnymailTrackingEvent, tracking
from django.core import mail
from django.test import TestCase, override_settings

from apps.core.emails import send_template_email
from apps.core.test_factories import make_customer

# A real template the project ships — keeps the test about suppression, not
# rendering. It needs a `user` in context, so every send passes one.
_TEXT_TEMPLATE = "emails/email_otp.txt"
_HTML_TEMPLATE = "emails/email_otp.html"


def _send(to, render_user) -> bool:
    return send_template_email(
        to=to,
        subject="Test",
        text_template=_TEXT_TEMPLATE,
        html_template=_HTML_TEMPLATE,
        context={"user": render_user, "code": "123456"},
    )


class SuppressionSendTests(TestCase):
    def test_sends_to_a_healthy_address(self):
        user = make_customer(email="healthy@example.com")
        self.assertTrue(_send(user.email, user))
        self.assertEqual(len(mail.outbox), 1)

    def test_skips_a_flagged_address_and_sends_nothing(self):
        user = make_customer(email="dead@example.com")
        user.email_bounced = True
        user.save(update_fields=["email_bounced"])

        self.assertFalse(_send(user.email, user))
        self.assertEqual(len(mail.outbox), 0)

    def test_drops_only_the_flagged_recipient_from_a_batch(self):
        good = make_customer(email="good@example.com")
        bad = make_customer(email="bad@example.com")
        bad.email_bounced = True
        bad.save(update_fields=["email_bounced"])

        self.assertTrue(_send([good.email, bad.email], good))
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, [good.email])

    def test_unknown_address_is_never_suppressed(self):
        # No User row for this address (e.g. an ops/admin recipient) → always sends.
        sender_identity = make_customer(email="someone@example.com")
        self.assertTrue(_send("ops@bookme.ph", sender_identity))
        self.assertEqual(len(mail.outbox), 1)


class TrackingSignalTests(TestCase):
    def _fire(self, *, event_type, recipient):
        event = AnymailTrackingEvent(event_type=event_type, recipient=recipient)
        tracking.send(sender=object(), event=event, esp_name="Resend")

    def test_hard_bounce_flags_the_user(self):
        user = make_customer(email="bounce@example.com")
        self._fire(event_type="bounced", recipient=user.email)
        user.refresh_from_db()
        self.assertTrue(user.email_bounced)

    def test_complaint_flags_the_user(self):
        user = make_customer(email="spam@example.com")
        self._fire(event_type="complained", recipient=user.email)
        user.refresh_from_db()
        self.assertTrue(user.email_bounced)

    def test_recipient_match_is_case_insensitive(self):
        user = make_customer(email="mixed@example.com")
        self._fire(event_type="bounced", recipient="Mixed@Example.com")
        user.refresh_from_db()
        self.assertTrue(user.email_bounced)

    def test_transient_event_does_not_flag(self):
        # A delivered/opened/soft event must never suppress.
        user = make_customer(email="fine@example.com")
        self._fire(event_type="delivered", recipient=user.email)
        user.refresh_from_db()
        self.assertFalse(user.email_bounced)

    def test_event_for_unknown_recipient_is_a_noop(self):
        # Should not raise even when no User matches.
        self._fire(event_type="bounced", recipient="nobody@example.com")


class ResendBackendConfigTests(TestCase):
    @override_settings(ANYMAIL={"RESEND_API_KEY": "re_test_key"})
    def test_resend_backend_is_importable_and_configurable(self):
        # Guards the dependency + settings wiring: switching EMAIL_BACKEND to
        # Resend must actually resolve to a usable connection.
        conn = mail.get_connection("anymail.backends.resend.EmailBackend")
        self.assertIsNotNone(conn)
