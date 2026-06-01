"""Service-layer rules: ownership checks, defense-in-depth, audit trail."""

from django.test import TestCase
from rest_framework.exceptions import ValidationError

from apps.core.test_factories import (
    make_admin,
    make_customer,
    make_reservation,
    make_shop,
    make_shop_owner,
)
from apps.support.models import Ticket, TicketEvent
from apps.support.services import (
    add_message,
    assign_ticket,
    change_priority,
    create_ticket,
    transition_status,
)


class CreateTicketTests(TestCase):
    def test_create_validates_subject_and_body(self):
        customer = make_customer()
        with self.assertRaises(ValidationError):
            create_ticket(
                submitter=customer,
                category=Ticket.Category.OTHER,
                subject="   ",
                body="hello",
            )
        with self.assertRaises(ValidationError):
            create_ticket(
                submitter=customer,
                category=Ticket.Category.OTHER,
                subject="hi",
                body="",
            )

    def test_create_rejects_unknown_category(self):
        customer = make_customer()
        with self.assertRaises(ValidationError):
            create_ticket(
                submitter=customer,
                category="not-a-real-category",
                subject="x",
                body="y",
            )

    def test_create_attaches_own_reservation(self):
        customer = make_customer()
        reservation = make_reservation(customer=customer)
        ticket = create_ticket(
            submitter=customer,
            category=Ticket.Category.BOOKING,
            subject="problem",
            body="explain",
            related_reservation=reservation,
        )
        self.assertEqual(ticket.related_reservation_id, reservation.id)

    def test_create_rejects_someone_elses_reservation(self):
        customer = make_customer()
        other = make_customer()
        # Reservation belongs to `other`.
        reservation = make_reservation(customer=other)
        with self.assertRaises(ValidationError):
            create_ticket(
                submitter=customer,
                category=Ticket.Category.BOOKING,
                subject="hijack",
                body="leak",
                related_reservation=reservation,
            )

    def test_shop_owner_can_attach_reservation_for_their_shop(self):
        owner = make_shop_owner()
        shop = make_shop(owner=owner)
        # Reservation for someone else AT the owner's shop.
        reservation = make_reservation(shop=shop)
        ticket = create_ticket(
            submitter=owner,
            category=Ticket.Category.BOOKING,
            subject="payment dispute",
            body="customer X disputes invoice",
            related_reservation=reservation,
        )
        self.assertEqual(ticket.related_reservation_id, reservation.id)

    def test_shop_owner_cannot_attach_someone_elses_shop(self):
        owner = make_shop_owner()
        other_shop = make_shop()  # not owned by `owner`
        with self.assertRaises(ValidationError):
            create_ticket(
                submitter=owner,
                category=Ticket.Category.SHOP,
                subject="hi",
                body="x",
                related_shop=other_shop,
            )

    def test_create_writes_audit_event(self):
        customer = make_customer()
        ticket = create_ticket(
            submitter=customer,
            category="other",
            subject="s",
            body="b",
        )
        events = ticket.events.all()
        self.assertEqual(events.count(), 1)
        self.assertEqual(events.first().event_type, TicketEvent.EventType.CREATED)


class AddMessageTests(TestCase):
    def test_non_admin_internal_flag_is_forced_false(self):
        customer = make_customer()
        ticket = create_ticket(
            submitter=customer, category="other", subject="s", body="b"
        )
        msg = add_message(
            ticket=ticket,
            author=customer,
            body="trying to set internal",
            is_internal=True,
        )
        # Defense-in-depth: a customer can never produce an internal note,
        # even if the view layer slips up.
        self.assertFalse(msg.is_internal)

    def test_admin_internal_flag_is_respected(self):
        admin = make_admin()
        customer = make_customer()
        ticket = create_ticket(
            submitter=customer, category="other", subject="s", body="b"
        )
        msg = add_message(
            ticket=ticket,
            author=admin,
            body="admin note",
            is_internal=True,
        )
        self.assertTrue(msg.is_internal)

    def test_non_participant_non_admin_cannot_post(self):
        customer = make_customer()
        intruder = make_customer()
        ticket = create_ticket(
            submitter=customer, category="other", subject="s", body="b"
        )
        with self.assertRaises(ValidationError):
            add_message(ticket=ticket, author=intruder, body="hi")

    def test_blank_body_rejected(self):
        customer = make_customer()
        ticket = create_ticket(
            submitter=customer, category="other", subject="s", body="b"
        )
        with self.assertRaises(ValidationError):
            add_message(ticket=ticket, author=customer, body="   ")

    def test_customer_reply_while_awaiting_flips_back_to_in_progress(self):
        admin = make_admin()
        customer = make_customer()
        ticket = create_ticket(
            submitter=customer, category="other", subject="s", body="b"
        )
        transition_status(
            ticket=ticket,
            new_status=Ticket.Status.AWAITING_CUSTOMER,
            actor=admin,
        )
        add_message(ticket=ticket, author=customer, body="here you go")
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, Ticket.Status.IN_PROGRESS)

    def test_message_added_event_is_written(self):
        customer = make_customer()
        ticket = create_ticket(
            submitter=customer, category="other", subject="s", body="b"
        )
        add_message(ticket=ticket, author=customer, body="follow-up")
        kinds = list(
            ticket.events.values_list("event_type", flat=True).order_by("id")
        )
        self.assertIn(TicketEvent.EventType.MESSAGE_ADDED, kinds)


class TransitionStatusTests(TestCase):
    def test_non_admin_rejected(self):
        customer = make_customer()
        ticket = create_ticket(
            submitter=customer, category="other", subject="s", body="b"
        )
        with self.assertRaises(ValidationError):
            transition_status(
                ticket=ticket,
                new_status=Ticket.Status.IN_PROGRESS,
                actor=customer,
            )

    def test_invalid_transition_rejected(self):
        admin = make_admin()
        customer = make_customer()
        ticket = create_ticket(
            submitter=customer, category="other", subject="s", body="b"
        )
        transition_status(
            ticket=ticket, new_status=Ticket.Status.CLOSED, actor=admin
        )
        # From closed, you can only go back to OPEN — not directly to
        # in_progress.
        with self.assertRaises(ValidationError):
            transition_status(
                ticket=ticket,
                new_status=Ticket.Status.IN_PROGRESS,
                actor=admin,
            )

    def test_unknown_status_rejected(self):
        admin = make_admin()
        customer = make_customer()
        ticket = create_ticket(
            submitter=customer, category="other", subject="s", body="b"
        )
        with self.assertRaises(ValidationError):
            transition_status(
                ticket=ticket, new_status="banana", actor=admin
            )

    def test_status_change_writes_event(self):
        admin = make_admin()
        customer = make_customer()
        ticket = create_ticket(
            submitter=customer, category="other", subject="s", body="b"
        )
        transition_status(
            ticket=ticket, new_status=Ticket.Status.RESOLVED, actor=admin
        )
        self.assertTrue(
            ticket.events.filter(
                event_type=TicketEvent.EventType.STATUS_CHANGED
            ).exists()
        )


class AssignTicketTests(TestCase):
    def test_non_admin_actor_rejected(self):
        owner = make_shop_owner()
        customer = make_customer()
        ticket = create_ticket(
            submitter=customer, category="other", subject="s", body="b"
        )
        with self.assertRaises(ValidationError):
            assign_ticket(ticket=ticket, assignee=owner, actor=owner)

    def test_non_admin_assignee_rejected(self):
        admin = make_admin()
        customer = make_customer()
        ticket = create_ticket(
            submitter=customer, category="other", subject="s", body="b"
        )
        with self.assertRaises(ValidationError):
            assign_ticket(ticket=ticket, assignee=customer, actor=admin)

    def test_admin_assignment_writes_event(self):
        a1 = make_admin()
        a2 = make_admin()
        customer = make_customer()
        ticket = create_ticket(
            submitter=customer, category="other", subject="s", body="b"
        )
        assign_ticket(ticket=ticket, assignee=a2, actor=a1)
        ticket.refresh_from_db()
        self.assertEqual(ticket.assigned_to_id, a2.id)
        self.assertTrue(
            ticket.events.filter(
                event_type=TicketEvent.EventType.ASSIGNED
            ).exists()
        )

    def test_unassigning_with_none(self):
        admin = make_admin()
        a2 = make_admin()
        customer = make_customer()
        ticket = create_ticket(
            submitter=customer, category="other", subject="s", body="b"
        )
        assign_ticket(ticket=ticket, assignee=a2, actor=admin)
        assign_ticket(ticket=ticket, assignee=None, actor=admin)
        ticket.refresh_from_db()
        self.assertIsNone(ticket.assigned_to_id)


class ChangePriorityTests(TestCase):
    def test_admin_can_bump(self):
        admin = make_admin()
        customer = make_customer()
        ticket = create_ticket(
            submitter=customer, category="other", subject="s", body="b"
        )
        change_priority(
            ticket=ticket, new_priority=Ticket.Priority.URGENT, actor=admin
        )
        ticket.refresh_from_db()
        self.assertEqual(ticket.priority, Ticket.Priority.URGENT)

    def test_non_admin_rejected(self):
        customer = make_customer()
        ticket = create_ticket(
            submitter=customer, category="other", subject="s", body="b"
        )
        with self.assertRaises(ValidationError):
            change_priority(
                ticket=ticket,
                new_priority=Ticket.Priority.HIGH,
                actor=customer,
            )
