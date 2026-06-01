"""HTTP-layer permission checks: scoping, internal-note hiding, admin gates."""

from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.test_factories import make_admin, make_customer
from apps.support.models import Ticket
from apps.support.services import add_message, create_ticket


def _open_ticket(submitter):
    return create_ticket(
        submitter=submitter,
        category=Ticket.Category.OTHER,
        subject="Test",
        body="Body",
    )


class TicketScopingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.alice = make_customer()
        self.bob = make_customer()
        self.alice_ticket = _open_ticket(self.alice)

    def test_customer_cannot_retrieve_another_customers_ticket(self):
        self.client.force_authenticate(self.bob)
        response = self.client.get(f"/api/support/tickets/{self.alice_ticket.id}/")
        # Scoped queryset → 404, NOT 403 (no existence disclosure).
        self.assertEqual(response.status_code, 404)

    def test_customer_list_only_returns_own_tickets(self):
        # Bob also has a ticket.
        _open_ticket(self.bob)
        self.client.force_authenticate(self.bob)
        response = self.client.get("/api/support/tickets/")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        results = body.get("results") or body
        for row in results:
            self.assertEqual(row["submitter"]["id"], self.bob.id)


class InternalNoteVisibilityTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.customer = make_customer()
        self.admin = make_admin()
        self.ticket = _open_ticket(self.customer)
        self.public_msg = add_message(
            ticket=self.ticket, author=self.admin, body="public reply"
        )
        self.private_msg = add_message(
            ticket=self.ticket,
            author=self.admin,
            body="admin only",
            is_internal=True,
        )

    def test_customer_detail_excludes_internal_messages(self):
        self.client.force_authenticate(self.customer)
        response = self.client.get(f"/api/support/tickets/{self.ticket.id}/")
        self.assertEqual(response.status_code, 200)
        messages = response.json()["messages"]
        ids = [m["id"] for m in messages]
        self.assertIn(self.public_msg.id, ids)
        self.assertNotIn(self.private_msg.id, ids)

    def test_customer_messages_endpoint_excludes_internal(self):
        self.client.force_authenticate(self.customer)
        response = self.client.get(
            f"/api/support/tickets/{self.ticket.id}/messages/"
        )
        self.assertEqual(response.status_code, 200)
        ids = [m["id"] for m in response.json()]
        self.assertNotIn(self.private_msg.id, ids)

    def test_admin_sees_internal_messages(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(
            f"/api/support/tickets/{self.ticket.id}/messages/"
        )
        self.assertEqual(response.status_code, 200)
        ids = [m["id"] for m in response.json()]
        self.assertIn(self.private_msg.id, ids)

    def test_customer_detail_does_not_leak_events(self):
        self.client.force_authenticate(self.customer)
        response = self.client.get(f"/api/support/tickets/{self.ticket.id}/")
        self.assertIsNone(response.json()["events"])

    def test_admin_detail_includes_events(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(f"/api/support/tickets/{self.ticket.id}/")
        body = response.json()
        self.assertIsNotNone(body["events"])
        self.assertGreater(len(body["events"]), 0)


class AdminGateTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.customer = make_customer()
        self.admin = make_admin()
        self.ticket = _open_ticket(self.customer)

    def test_customer_cannot_transition(self):
        self.client.force_authenticate(self.customer)
        response = self.client.post(
            f"/api/support/tickets/{self.ticket.id}/transition/",
            {"new_status": Ticket.Status.IN_PROGRESS},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_customer_cannot_assign(self):
        self.client.force_authenticate(self.customer)
        response = self.client.post(
            f"/api/support/tickets/{self.ticket.id}/assign/",
            {"assignee_id": self.admin.id},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_admin_can_transition(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            f"/api/support/tickets/{self.ticket.id}/transition/",
            {"new_status": Ticket.Status.IN_PROGRESS},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "in_progress")

    def test_admin_can_assign(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            f"/api/support/tickets/{self.ticket.id}/assign/",
            {"assignee_id": self.admin.id},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["assigned_to"]["id"], self.admin.id)

    def test_customer_cannot_post_internal_note(self):
        self.client.force_authenticate(self.customer)
        response = self.client.post(
            f"/api/support/tickets/{self.ticket.id}/messages/",
            {"body": "secret", "is_internal": True},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
