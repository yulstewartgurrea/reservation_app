"""Tests for the customer-detail fields and RSV reference on the inbox serializer."""

from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.test_factories import (
    future_dt,
    make_customer,
    make_reservation,
    make_service,
    make_shop,
    make_shop_owner,
    make_staff,
)
from apps.reservations.services import create_walk_in


class ReservationListSerializerFieldsTests(TestCase):
    """The owner inbox must include customer name/email/phone, notes, RSV, staff."""

    def setUp(self):
        self.client = APIClient()
        self.owner = make_shop_owner()
        self.shop = make_shop(owner=self.owner)
        self.service = make_service(shop=self.shop)
        self.staff = make_staff(shop=self.shop, name="Marco")
        self.customer = make_customer(email="cust@example.com")
        self.customer.first_name = "Juan"
        self.customer.last_name = "Dela Cruz"
        self.customer.phone = "+639170000001"
        self.customer.save()

    def _get_inbox_row(self):
        self.client.force_authenticate(self.owner)
        response = self.client.get("/api/reservations/")
        rows = response.json().get("results") or response.json()
        self.assertEqual(len(rows), 1)
        return rows[0]

    def test_customer_name_uses_full_name_when_available(self):
        make_reservation(
            customer=self.customer,
            shop=self.shop,
            service=self.service,
            staff=self.staff,
        )
        row = self._get_inbox_row()
        self.assertEqual(row["customer_name"], "Juan Dela Cruz")

    def test_customer_email_and_phone_exposed(self):
        make_reservation(
            customer=self.customer, shop=self.shop, service=self.service
        )
        row = self._get_inbox_row()
        self.assertEqual(row["customer_email"], "cust@example.com")
        self.assertEqual(row["customer_phone"], "+639170000001")

    def test_reference_is_zero_padded(self):
        r = make_reservation(
            customer=self.customer, shop=self.shop, service=self.service
        )
        row = self._get_inbox_row()
        self.assertEqual(row["reference"], f"RSV-{r.id:06d}")

    def test_walk_in_uses_guest_name_and_phone(self):
        create_walk_in(
            shop_owner=self.owner,
            shop=self.shop,
            service=self.service,
            start_at=future_dt(2),
            guest_name="Walk-In Wendy",
            guest_phone="+639170000099",
        )
        row = self._get_inbox_row()
        self.assertEqual(row["customer_name"], "Walk-In Wendy")
        self.assertEqual(row["customer_phone"], "+639170000099")
        self.assertEqual(row["customer_email"], "")
        self.assertEqual(row["source"], "walk_in")

    def test_staff_name_exposed(self):
        make_reservation(
            customer=self.customer,
            shop=self.shop,
            service=self.service,
            staff=self.staff,
        )
        row = self._get_inbox_row()
        self.assertEqual(row["staff_name"], "Marco")
        self.assertEqual(row["service_duration_minutes"], 60)

    def test_customer_notes_exposed(self):
        r = make_reservation(
            customer=self.customer, shop=self.shop, service=self.service
        )
        r.customer_notes = "Please bring cleaning materials"
        r.save()
        row = self._get_inbox_row()
        self.assertEqual(row["customer_notes"], "Please bring cleaning materials")
