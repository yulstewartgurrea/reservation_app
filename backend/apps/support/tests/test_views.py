"""HTTP integration tests: create, list filters, replies, file attachments."""

from unittest import mock

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.core.test_factories import (
    make_admin,
    make_customer,
    make_reservation,
)
from apps.support.models import Ticket, TicketMessage
from apps.support.services import create_ticket


def _png(name="x.png", size=64):
    return SimpleUploadedFile(name, b"\x89PNG" + b"0" * (size - 4), content_type="image/png")


class CreateTicketViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.customer = make_customer()
        self.client.force_authenticate(self.customer)

    def test_create_minimal(self):
        # Service uses `transaction.on_commit` to defer the email send so we
        # don't email about a ticket that ultimately rolls back. TestCase
        # wraps each test in a transaction that never commits, so we use
        # captureOnCommitCallbacks to inspect the queued callbacks.
        with mock.patch(
            "apps.support.tasks.email_ticket_created_customer.delay"
        ) as mock_cust_delay, mock.patch(
            "apps.support.tasks.email_ticket_created_admin.delay"
        ) as mock_admin_delay, self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                "/api/support/tickets/",
                {"category": "other", "subject": "Hi", "body": "There"},
                format="json",
            )
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertEqual(body["subject"], "Hi")
        self.assertEqual(body["status"], "open")
        self.assertEqual(body["submitter"]["id"], self.customer.id)
        # Both emails were queued on commit.
        mock_cust_delay.assert_called_once()
        mock_admin_delay.assert_called_once()

    def test_create_rejects_blank_subject(self):
        response = self.client.post(
            "/api/support/tickets/",
            {"category": "other", "subject": "   ", "body": "anything"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_create_rejects_unknown_category(self):
        response = self.client.post(
            "/api/support/tickets/",
            {"category": "wat", "subject": "ok", "body": "ok"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_create_rejects_someone_elses_reservation(self):
        other = make_customer()
        res = make_reservation(customer=other)
        response = self.client.post(
            "/api/support/tickets/",
            {
                "category": "booking",
                "subject": "x",
                "body": "y",
                "related_reservation": res.id,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)


class ListFilterTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.customer = make_customer()
        self.admin = make_admin()
        # 3 tickets, varied state.
        self.t_open = create_ticket(
            submitter=self.customer, category="other", subject="open1", body="b"
        )
        self.t_billing = create_ticket(
            submitter=self.customer, category="payment", subject="pay1", body="b"
        )
        self.t_other = create_ticket(
            submitter=make_customer(), category="bug", subject="bug1", body="b"
        )

    def test_customer_list_scopes_to_own(self):
        self.client.force_authenticate(self.customer)
        response = self.client.get("/api/support/tickets/")
        ids = {row["id"] for row in (response.json().get("results") or response.json())}
        self.assertEqual(ids, {self.t_open.id, self.t_billing.id})

    def test_admin_list_unfiltered(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/support/tickets/")
        ids = {row["id"] for row in (response.json().get("results") or response.json())}
        self.assertEqual(
            ids, {self.t_open.id, self.t_billing.id, self.t_other.id}
        )

    def test_admin_can_filter_by_category(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/support/tickets/?category=payment")
        ids = {row["id"] for row in (response.json().get("results") or response.json())}
        self.assertEqual(ids, {self.t_billing.id})

    def test_admin_can_search_subject(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/support/tickets/?q=bug1")
        ids = {row["id"] for row in (response.json().get("results") or response.json())}
        self.assertEqual(ids, {self.t_other.id})


class ReplyTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.customer = make_customer()
        self.admin = make_admin()
        self.ticket = create_ticket(
            submitter=self.customer,
            category="other",
            subject="reply",
            body="body",
        )

    def test_customer_can_reply(self):
        self.client.force_authenticate(self.customer)
        with mock.patch(
            "apps.support.tasks.email_ticket_replied.delay"
        ) as mock_delay, self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                f"/api/support/tickets/{self.ticket.id}/messages/",
                {"body": "follow-up"},
                format="json",
            )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["body"], "follow-up")
        self.assertFalse(response.json()["is_internal"])
        mock_delay.assert_called_once()

    def test_reply_rejects_empty_body(self):
        self.client.force_authenticate(self.customer)
        response = self.client.post(
            f"/api/support/tickets/{self.ticket.id}/messages/",
            {"body": "   "},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_reply_with_valid_png_attachment(self):
        self.client.force_authenticate(self.customer)
        response = self.client.post(
            f"/api/support/tickets/{self.ticket.id}/messages/",
            {"body": "see image", "attachments": _png()},
            format="multipart",
        )
        self.assertEqual(response.status_code, 201, response.content)
        attachments = response.json()["attachments"]
        self.assertEqual(len(attachments), 1)
        self.assertEqual(attachments[0]["content_type"], "image/png")

    def test_reply_rejects_disallowed_mime(self):
        self.client.force_authenticate(self.customer)
        bad = SimpleUploadedFile(
            "evil.exe", b"MZ" + b"0" * 64, content_type="application/x-msdownload"
        )
        response = self.client.post(
            f"/api/support/tickets/{self.ticket.id}/messages/",
            {"body": "danger", "attachments": bad},
            format="multipart",
        )
        self.assertEqual(response.status_code, 400)

    def test_reply_rejects_oversized_attachment(self):
        self.client.force_authenticate(self.customer)
        too_big = SimpleUploadedFile(
            "huge.png", b"\x89PNG" + b"0" * (6 * 1024 * 1024), content_type="image/png"
        )
        response = self.client.post(
            f"/api/support/tickets/{self.ticket.id}/messages/",
            {"body": "huge", "attachments": too_big},
            format="multipart",
        )
        self.assertEqual(response.status_code, 400)

    def test_reply_rejects_too_many_attachments(self):
        self.client.force_authenticate(self.customer)
        files = [_png(name=f"f{i}.png") for i in range(6)]
        response = self.client.post(
            f"/api/support/tickets/{self.ticket.id}/messages/",
            {"body": "many", "attachments": files},
            format="multipart",
        )
        self.assertEqual(response.status_code, 400)

    def test_admin_internal_note_does_not_email(self):
        self.client.force_authenticate(self.admin)
        with mock.patch(
            "apps.support.tasks.email_ticket_replied.delay"
        ) as mock_delay, self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                f"/api/support/tickets/{self.ticket.id}/messages/",
                {"body": "secret note", "is_internal": True},
                format="json",
            )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertTrue(response.json()["is_internal"])
        mock_delay.assert_not_called()


class PatchTicketTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.customer = make_customer()
        self.admin = make_admin()
        self.ticket = create_ticket(
            submitter=self.customer,
            category="other",
            subject="orig",
            body="orig body",
        )

    def test_submitter_can_edit_subject_while_open(self):
        self.client.force_authenticate(self.customer)
        response = self.client.patch(
            f"/api/support/tickets/{self.ticket.id}/",
            {"subject": "edited"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["subject"], "edited")

    def test_submitter_cannot_edit_after_in_progress(self):
        # Admin moves it.
        self.client.force_authenticate(self.admin)
        self.client.post(
            f"/api/support/tickets/{self.ticket.id}/transition/",
            {"new_status": "in_progress"},
            format="json",
        )
        # Customer tries to edit subject.
        self.client.force_authenticate(self.customer)
        response = self.client.patch(
            f"/api/support/tickets/{self.ticket.id}/",
            {"subject": "sneaky"},
            format="json",
        )
        # The patch returns 200 but didn't apply (no fields edited).
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.subject, "orig")
        # API still returns 200 (idempotent no-op for the submitter).
        self.assertEqual(response.status_code, 200)

    def test_admin_can_change_priority_via_patch(self):
        self.client.force_authenticate(self.admin)
        response = self.client.patch(
            f"/api/support/tickets/{self.ticket.id}/",
            {"priority": "urgent"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["priority"], "urgent")


class ThrottleTests(TestCase):
    """Hit the rate limit on ticket create to prove the throttle is wired.

    Tests override `support_ticket_create` to a low rate; the test_settings
    default leaves all support throttles at None so unrelated tests are fast.
    """

    def test_create_throttle_limits_rapid_calls(self):
        from django.conf import settings as dj_settings
        from django.core.cache import cache

        # Apply the override inline so the merged dict is freshly computed
        # against the *current* test_settings (the class-level decorator
        # baked it in at import time, which made some test runs miss the
        # support_ticket_create entry).
        rates = {
            **dj_settings.REST_FRAMEWORK.get("DEFAULT_THROTTLE_RATES", {}),
            "support_ticket_create": "2/hour",
        }
        with override_settings(
            REST_FRAMEWORK={
                **dj_settings.REST_FRAMEWORK,
                "DEFAULT_THROTTLE_RATES": rates,
            }
        ):
            cache.clear()
            client = APIClient()
            customer = make_customer()
            client.force_authenticate(customer)

            def _post():
                with mock.patch(
                    "apps.support.tasks.email_ticket_created_customer.delay"
                ), mock.patch(
                    "apps.support.tasks.email_ticket_created_admin.delay"
                ):
                    return client.post(
                        "/api/support/tickets/",
                        {"category": "other", "subject": "s", "body": "b"},
                        format="json",
                    )

            self.assertEqual(_post().status_code, 201)
            self.assertEqual(_post().status_code, 201)
            # Third call inside the same hour → 429.
            self.assertEqual(_post().status_code, 429)
