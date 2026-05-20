"""Monthly commission invoicing + collection.

Covers: generation idempotency, settle/pay stamping ledger rows, PayMongo
paid-webhook routing to an invoice, the invoice dev-confirm path, overdue ->
auto-pause and pay -> auto-resume, permissions, and the zero-commission case.
"""

from datetime import timedelta
from decimal import Decimal

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from apps.core.test_factories import (
    future_dt,
    make_admin,
    make_customer,
    make_service,
    make_shop,
    make_shop_owner,
    make_reservation,
)
from apps.reservations.commission_billing import (
    assert_shop_not_blocked_for_commission,
    create_invoice_payment_link,
    generate_monthly_invoices,
    previous_period,
    process_overdue_invoices,
)
from apps.reservations.models import CommissionInvoice, CommissionLedger, Reservation
from apps.reservations.services import transition
from apps.shops.models import Shop


_slot_offsets: dict[int, int] = {}


def _complete_online_reservation(shop, *, price="500.00"):
    """Make an online reservation at a unique slot, complete it -> writes a
    CommissionLedger row. Returns (reservation, commission_amount)."""
    service = make_service(shop=shop, price=price)
    # Stagger start times per shop so back-to-back bookings never collide.
    n = _slot_offsets.get(shop.id, 0)
    _slot_offsets[shop.id] = n + 1
    res = make_reservation(
        shop=shop,
        service=service,
        start_at=future_dt(48 + n * 24),
        payment_method=Reservation.PaymentMethod.ONLINE,
    )
    transition(reservation=res, to_status=Reservation.Status.COMPLETED, actor=None)
    res.refresh_from_db()
    return res, res.commission_amount


class GenerationIdempotencyTests(TestCase):
    def setUp(self):
        self.shop = make_shop()

    def test_generation_is_idempotent_and_sums_correctly(self):
        _, c1 = _complete_online_reservation(self.shop, price="500.00")
        _, c2 = _complete_online_reservation(self.shop, price="300.00")
        period = CommissionLedger.objects.first().period

        first = generate_monthly_invoices(period)
        self.assertEqual(len(first), 1)
        invoice = first[0]
        self.assertEqual(invoice.amount, (c1 + c2).quantize(Decimal("0.01")))

        # Re-run: no duplicate, same invoice.
        second = generate_monthly_invoices(period)
        self.assertEqual(CommissionInvoice.objects.count(), 1)
        self.assertEqual(second[0].id, invoice.id)

    def test_paid_invoice_is_never_re_billed(self):
        _, c1 = _complete_online_reservation(self.shop, price="500.00")
        period = CommissionLedger.objects.first().period
        invoice = generate_monthly_invoices(period)[0]

        from apps.reservations.commission_billing import mark_invoice_paid

        mark_invoice_paid(invoice, settled_offline=True)

        # New commission lands in same period AFTER payment.
        _complete_online_reservation(self.shop, price="1000.00")
        again = generate_monthly_invoices(period)
        # Paid invoice untouched; nothing returned/created for it.
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, CommissionInvoice.Status.PAID)
        self.assertEqual(invoice.amount, c1.quantize(Decimal("0.01")))
        self.assertEqual(CommissionInvoice.objects.count(), 1)
        self.assertEqual(again, [])

    def test_open_invoice_amount_refreshes_on_rerun(self):
        _, c1 = _complete_online_reservation(self.shop, price="500.00")
        period = CommissionLedger.objects.first().period
        invoice = generate_monthly_invoices(period)[0]
        self.assertEqual(invoice.amount, c1.quantize(Decimal("0.01")))

        _, c2 = _complete_online_reservation(self.shop, price="500.00")
        generate_monthly_invoices(period)
        invoice.refresh_from_db()
        self.assertEqual(invoice.amount, (c1 + c2).quantize(Decimal("0.01")))

    def test_zero_commission_shop_gets_no_invoice(self):
        # A shop with no completed online reservations.
        make_shop()
        invoices = generate_monthly_invoices(previous_period())
        self.assertEqual(invoices, [])
        self.assertEqual(CommissionInvoice.objects.count(), 0)


class SettlementTests(TestCase):
    def setUp(self):
        self.shop = make_shop()
        _complete_online_reservation(self.shop, price="500.00")
        self.period = CommissionLedger.objects.first().period
        self.invoice = generate_monthly_invoices(self.period)[0]

    def test_settle_stamps_all_period_ledger_rows(self):
        from apps.reservations.commission_billing import mark_invoice_paid

        # Another ledger row in same period, still unsettled.
        _complete_online_reservation(self.shop, price="200.00")
        self.assertEqual(
            CommissionLedger.objects.filter(
                shop=self.shop, period=self.period, settled_at__isnull=True
            ).count(),
            2,
        )
        mark_invoice_paid(self.invoice, settled_offline=True)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, CommissionInvoice.Status.PAID)
        self.assertTrue(self.invoice.settled_offline)
        self.assertEqual(
            CommissionLedger.objects.filter(
                shop=self.shop, period=self.period, settled_at__isnull=True
            ).count(),
            0,
        )

    def test_mark_paid_is_idempotent(self):
        from apps.reservations.commission_billing import mark_invoice_paid

        mark_invoice_paid(self.invoice, settled_offline=True)
        first_paid_at = self.invoice.paid_at
        mark_invoice_paid(self.invoice, settled_offline=True)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.paid_at, first_paid_at)

    def test_void_does_not_settle_ledger(self):
        from apps.reservations.commission_billing import void_invoice

        void_invoice(self.invoice, actor=None, reason="duplicate")
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, CommissionInvoice.Status.VOID)
        self.assertTrue(
            CommissionLedger.objects.filter(
                shop=self.shop, period=self.period, settled_at__isnull=True
            ).exists()
        )


@override_settings(PAYMONGO_SECRET_KEY="")
class PaymentLinkAndWebhookTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = make_shop_owner()
        self.shop = make_shop(owner=self.owner)
        _complete_online_reservation(self.shop, price="500.00")
        self.period = CommissionLedger.objects.first().period
        self.invoice = generate_monthly_invoices(self.period)[0]

    def test_dev_payment_link_works_without_api_key(self):
        url = create_invoice_payment_link(self.invoice)
        self.invoice.refresh_from_db()
        self.assertTrue(url)
        self.assertTrue(self.invoice.paymongo_session_id.startswith("dev_fake_"))

    def test_webhook_routes_paid_event_to_invoice(self):
        create_invoice_payment_link(self.invoice)
        self.invoice.refresh_from_db()
        sid = self.invoice.paymongo_session_id
        body = {
            "data": {
                "attributes": {
                    "type": "checkout_session.payment.paid",
                    "data": {"id": sid},
                }
            }
        }
        resp = self.client.post(
            "/api/payments/webhooks/paymongo/", body, format="json"
        )
        self.assertEqual(resp.status_code, 200)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, CommissionInvoice.Status.PAID)
        self.assertFalse(self.invoice.settled_offline)

    def test_owner_pay_endpoint_returns_payment_url(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.post(
            f"/api/payments/commission-invoices/{self.invoice.id}/pay/"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertIn("payment_url", resp.json())

    def test_other_owner_cannot_pay_my_invoice(self):
        intruder = make_shop_owner()
        self.client.force_authenticate(intruder)
        resp = self.client.post(
            f"/api/payments/commission-invoices/{self.invoice.id}/pay/"
        )
        self.assertEqual(resp.status_code, 403)

    def test_dev_confirm_marks_invoice_paid(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.post(
            f"/api/payments/commission-invoices/{self.invoice.id}/confirm-dev/"
        )
        self.assertEqual(resp.status_code, 200)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, CommissionInvoice.Status.PAID)

    def test_dev_confirm_forbidden_for_other_owner(self):
        self.client.force_authenticate(make_shop_owner())
        resp = self.client.post(
            f"/api/payments/commission-invoices/{self.invoice.id}/confirm-dev/"
        )
        self.assertEqual(resp.status_code, 403)


class OverduePauseResumeTests(TestCase):
    def setUp(self):
        self.shop = make_shop()
        _complete_online_reservation(self.shop, price="500.00")
        self.period = CommissionLedger.objects.first().period
        self.invoice = generate_monthly_invoices(self.period)[0]

    def _make_overdue(self, *, days_past_due):
        self.invoice.due_date = timezone.now().date() - timedelta(days=days_past_due)
        self.invoice.save(update_fields=["due_date"])

    @override_settings(COMMISSION_INVOICE_GRACE_DAYS=7)
    def test_overdue_within_grace_reminds_but_does_not_pause(self):
        self._make_overdue(days_past_due=3)
        result = process_overdue_invoices()
        self.assertEqual(result["reminded"], 1)
        self.assertEqual(result["paused"], 0)
        self.shop.refresh_from_db()
        self.assertEqual(self.shop.status, Shop.Status.ACTIVE)

    @override_settings(COMMISSION_INVOICE_GRACE_DAYS=7)
    def test_overdue_past_grace_pauses_then_pay_resumes(self):
        self._make_overdue(days_past_due=10)
        result = process_overdue_invoices()
        self.assertEqual(result["paused"], 1)
        self.shop.refresh_from_db()
        self.assertEqual(self.shop.status, Shop.Status.PAUSED)
        self.assertTrue(self.shop.auto_paused_for_unpaid_commission)

        # New bookings are blocked while overdue.
        with self.assertRaises(ValidationError):
            assert_shop_not_blocked_for_commission(self.shop)

        from apps.reservations.commission_billing import mark_invoice_paid

        mark_invoice_paid(self.invoice, settled_offline=True)
        self.shop.refresh_from_db()
        self.assertEqual(self.shop.status, Shop.Status.ACTIVE)
        self.assertFalse(self.shop.auto_paused_for_unpaid_commission)
        # No longer blocked.
        assert_shop_not_blocked_for_commission(self.shop)

    @override_settings(COMMISSION_INVOICE_GRACE_DAYS=7)
    def test_overdue_scan_does_not_spam_same_day(self):
        self._make_overdue(days_past_due=10)
        first = process_overdue_invoices()
        self.assertEqual(first["reminded"], 1)
        second = process_overdue_invoices()
        self.assertEqual(second["reminded"], 0)

    @override_settings(COMMISSION_INVOICE_GRACE_DAYS=7)
    def test_manual_pause_not_resumed_by_payment(self):
        # Owner manually paused (not a billing pause).
        self.shop.status = Shop.Status.PAUSED
        self.shop.save(update_fields=["status"])

        from apps.reservations.commission_billing import mark_invoice_paid

        mark_invoice_paid(self.invoice, settled_offline=True)
        self.shop.refresh_from_db()
        # Still paused — payment must not clobber an owner's manual pause.
        self.assertEqual(self.shop.status, Shop.Status.PAUSED)


class AdminEndpointPermissionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.shop = make_shop()
        _complete_online_reservation(self.shop, price="500.00")
        self.period = CommissionLedger.objects.first().period

    def test_non_admin_blocked_on_admin_invoice_endpoints(self):
        self.client.force_authenticate(make_shop_owner())
        self.assertEqual(
            self.client.get("/api/admin-panel/commission/invoices/").status_code,
            403,
        )
        self.assertEqual(
            self.client.post(
                "/api/admin-panel/commission/invoices/generate/"
            ).status_code,
            403,
        )

    def test_admin_generate_and_settle_flow(self):
        self.client.force_authenticate(make_admin())
        gen = self.client.post(
            "/api/admin-panel/commission/invoices/generate/",
            {"period": self.period},
            format="json",
        )
        self.assertEqual(gen.status_code, 200)
        self.assertEqual(gen.json()["generated"], 1)

        invoice_id = CommissionInvoice.objects.first().id
        listing = self.client.get("/api/admin-panel/commission/invoices/")
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(len(listing.json()["rows"]), 1)

        settle = self.client.post(
            f"/api/admin-panel/commission/invoices/{invoice_id}/settle/"
        )
        self.assertEqual(settle.status_code, 200)
        self.assertEqual(settle.json()["status"], "paid")
        self.assertTrue(settle.json()["settled_offline"])

    def test_admin_void_only_from_open(self):
        self.client.force_authenticate(make_admin())
        self.client.post(
            "/api/admin-panel/commission/invoices/generate/",
            {"period": self.period},
            format="json",
        )
        invoice_id = CommissionInvoice.objects.first().id
        void = self.client.post(
            f"/api/admin-panel/commission/invoices/{invoice_id}/void/"
        )
        self.assertEqual(void.status_code, 200)
        self.assertEqual(void.json()["status"], "void")
        # Voiding again -> 400 (only from open).
        again = self.client.post(
            f"/api/admin-panel/commission/invoices/{invoice_id}/void/"
        )
        self.assertEqual(again.status_code, 400)


class OwnerInvoiceListingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = make_shop_owner()
        self.shop = make_shop(owner=self.owner)
        _complete_online_reservation(self.shop, price="500.00")
        self.period = CommissionLedger.objects.first().period
        generate_monthly_invoices(self.period)

    def test_owner_sees_only_own_invoices(self):
        other_owner = make_shop_owner()
        other_shop = make_shop(owner=other_owner)
        _complete_online_reservation(other_shop, price="900.00")
        generate_monthly_invoices(CommissionLedger.objects.first().period)

        self.client.force_authenticate(self.owner)
        resp = self.client.get("/api/shops/commission-invoices/")
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(len(body), 1)
        self.assertEqual(body[0]["shop"], self.shop.id)

    def test_customer_cannot_list_owner_invoices(self):
        self.client.force_authenticate(make_customer())
        resp = self.client.get("/api/shops/commission-invoices/")
        self.assertEqual(resp.status_code, 403)
