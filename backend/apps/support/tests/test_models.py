"""Model-level invariants for the support module."""

from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from apps.core.test_factories import make_admin, make_customer
from apps.support.models import Ticket, TicketEvent
from apps.support.services import (
    add_message,
    create_ticket,
    transition_status,
)


class TicketDefaultsTests(TestCase):
    def test_defaults_are_open_normal_other(self):
        customer = make_customer()
        ticket = create_ticket(
            submitter=customer,
            category=Ticket.Category.OTHER,
            subject="Hello",
            body="World",
        )
        self.assertEqual(ticket.status, Ticket.Status.OPEN)
        self.assertEqual(ticket.priority, Ticket.Priority.NORMAL)
        self.assertEqual(ticket.category, Ticket.Category.OTHER)
        self.assertIsNone(ticket.resolved_at)
        # Created event always written.
        self.assertEqual(
            ticket.events.filter(event_type=TicketEvent.EventType.CREATED).count(),
            1,
        )

    def test_str_renders_id_and_status(self):
        customer = make_customer()
        ticket = create_ticket(
            submitter=customer,
            category=Ticket.Category.OTHER,
            subject="Hi",
            body="There",
        )
        self.assertIn(str(ticket.pk), str(ticket))
        self.assertIn("open", str(ticket))


class TicketOrderingTests(TestCase):
    def test_list_ordering_is_by_last_message_at_desc(self):
        customer = make_customer()
        t1 = create_ticket(
            submitter=customer, category="other", subject="One", body="b"
        )
        t2 = create_ticket(
            submitter=customer, category="other", subject="Two", body="b"
        )
        # Reply on t1 — it should now sort first.
        add_message(ticket=t1, author=customer, body="bump")
        ordered = list(Ticket.objects.all())
        self.assertEqual(ordered[0].pk, t1.pk)
        self.assertEqual(ordered[1].pk, t2.pk)


class LastMessageAtTests(TestCase):
    def test_add_message_bumps_last_message_at(self):
        customer = make_customer()
        ticket = create_ticket(
            submitter=customer, category="other", subject="s", body="b"
        )
        before = ticket.last_message_at
        # Force a small backwards jump so we can detect the bump regardless
        # of clock resolution.
        ticket.last_message_at = before - timedelta(minutes=5)
        ticket.save(update_fields=["last_message_at"])

        add_message(ticket=ticket, author=customer, body="follow-up")
        ticket.refresh_from_db()
        self.assertGreater(ticket.last_message_at, before - timedelta(minutes=5))

    def test_internal_note_does_not_bump_last_message_at(self):
        admin = make_admin()
        customer = make_customer()
        ticket = create_ticket(
            submitter=customer, category="other", subject="s", body="b"
        )
        # Slide the timestamp back so a "bump" would be detectable.
        ticket.last_message_at = timezone.now() - timedelta(hours=2)
        ticket.save(update_fields=["last_message_at"])
        snapshot = ticket.last_message_at

        add_message(ticket=ticket, author=admin, body="private", is_internal=True)
        ticket.refresh_from_db()
        # Internal notes don't bump the customer-facing activity timestamp.
        self.assertEqual(ticket.last_message_at, snapshot)


class ResolvedAtTransitionTests(TestCase):
    def test_resolving_sets_resolved_at(self):
        admin = make_admin()
        customer = make_customer()
        ticket = create_ticket(
            submitter=customer, category="other", subject="s", body="b"
        )
        transition_status(
            ticket=ticket, new_status=Ticket.Status.RESOLVED, actor=admin
        )
        ticket.refresh_from_db()
        self.assertIsNotNone(ticket.resolved_at)

    def test_reopening_from_resolved_clears_resolved_at(self):
        admin = make_admin()
        customer = make_customer()
        ticket = create_ticket(
            submitter=customer, category="other", subject="s", body="b"
        )
        transition_status(
            ticket=ticket, new_status=Ticket.Status.RESOLVED, actor=admin
        )
        ticket.refresh_from_db()
        self.assertIsNotNone(ticket.resolved_at)

        transition_status(
            ticket=ticket, new_status=Ticket.Status.OPEN, actor=admin
        )
        ticket.refresh_from_db()
        self.assertIsNone(ticket.resolved_at)
