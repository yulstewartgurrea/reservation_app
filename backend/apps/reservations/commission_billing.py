"""Monthly commission invoicing + collection (service layer).

Chosen model (no hybrid/netting/wallet): ONE uniform invoice per shop per
month covering ALL of that shop's commission for the period. The shop pays it
via a PayMongo payment link, or an admin marks it settled offline. Generation
is idempotent so the Beat job (or a manual admin re-trigger) never duplicates
or double-charges.

Shop-pause mechanism reused: the existing `Shop.status = PAUSED` (the same
flag the owner-facing publish/pause feature toggles, and the same one public
shop listings already filter on). To keep auto-pause distinct from a manual
pause, `Shop.auto_paused_for_unpaid_commission` records that the *platform*
paused the shop for billing — so auto-resume on payment only un-pauses shops
it itself paused. A belt-and-suspenders booking-creation guard
(`assert_shop_not_blocked_for_commission`) is the canonical block.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.core.emails import get_frontend_url, send_template_email
from apps.notifications.models import Notification
from apps.notifications.services import push_to_user
from apps.shops.models import Shop

from .models import CommissionInvoice, CommissionLedger

logger = logging.getLogger(__name__)


def _due_days() -> int:
    return int(getattr(settings, "COMMISSION_INVOICE_DUE_DAYS", 7))


def _grace_days() -> int:
    return int(getattr(settings, "COMMISSION_INVOICE_GRACE_DAYS", 7))


def previous_period() -> str:
    """The previous calendar month as 'YYYY-MM'."""
    today = timezone.now().date()
    first_of_this_month = today.replace(day=1)
    last_month = first_of_this_month - timedelta(days=1)
    return last_month.strftime("%Y-%m")


def _owner_name(user) -> str:
    return user.first_name or user.username or user.email.split("@")[0]


def _notify_owner(*, shop, kind: str, title: str, body: str, payload: dict) -> None:
    """Persist + WS-push an in-app notification to the shop owner."""
    owner = shop.owner
    if owner is None:
        return
    try:
        push_to_user(user=owner, kind=kind, title=title, body=body, payload=payload)
    except Exception:  # noqa: BLE001 — in-app notification must never block billing
        logger.warning("commission notification push failed for shop %s", shop.id)


# --------------------------------------------------------------------------- #
# Generation
# --------------------------------------------------------------------------- #


@transaction.atomic
def generate_monthly_invoices(period: str | None = None) -> list[CommissionInvoice]:
    """Create/refresh one CommissionInvoice per shop with unsettled commission
    in `period` (defaults to the previous calendar month).

    Idempotent:
      * get_or_create on (shop, period) — re-running never duplicates.
      * If an OPEN invoice exists, its amount is refreshed from the *current*
        unsettled ledger rows for that period (no double-charge).
      * PAID / VOID invoices are never touched.
      * Zero or negative totals are skipped (no invoice created).
    """
    period = period or previous_period()

    sums = (
        CommissionLedger.objects.filter(period=period, settled_at__isnull=True)
        .values("shop_id")
        .annotate(total=Sum("amount"))
    )

    touched: list[CommissionInvoice] = []
    for row in sums:
        shop_id = row["shop_id"]
        total = (row["total"] or Decimal("0")).quantize(Decimal("0.01"))
        if total <= Decimal("0"):
            continue

        existing = CommissionInvoice.objects.filter(
            shop_id=shop_id, period=period
        ).first()

        if existing and existing.status in (
            CommissionInvoice.Status.PAID,
            CommissionInvoice.Status.VOID,
        ):
            # Already collected or cancelled — never re-bill.
            continue

        shop = Shop.objects.get(pk=shop_id)
        issue_date = timezone.now().date()
        due = issue_date + timedelta(days=_due_days())

        if existing:
            # Open invoice: refresh the amount only (preserve due date so the
            # owner isn't given a fresh week every re-run).
            if existing.amount != total:
                existing.amount = total
                existing.save(update_fields=["amount"])
            invoice = existing
            created = False
        else:
            invoice = CommissionInvoice.objects.create(
                shop=shop,
                period=period,
                amount=total,
                status=CommissionInvoice.Status.OPEN,
                due_date=due,
            )
            created = True

        touched.append(invoice)
        if created:
            _send_invoice_issued_notice(invoice)

    return touched


def _send_invoice_issued_notice(invoice: CommissionInvoice) -> None:
    shop = invoice.shop
    owner = shop.owner
    if owner and owner.email:
        send_template_email(
            to=owner.email,
            subject=f"Commission invoice for {invoice.period} — {shop.name}",
            text_template="emails/commission_invoice_issued.txt",
            html_template="emails/commission_invoice_issued.html",
            context={
                "owner_name": _owner_name(owner),
                "shop": shop,
                "period": invoice.period,
                "amount": invoice.amount,
                "due_date": invoice.due_date,
                "frontend_url": get_frontend_url(),
            },
        )
    _notify_owner(
        shop=shop,
        kind=Notification.Kind.COMMISSION_INVOICE_ISSUED,
        title=f"Commission invoice for {invoice.period}",
        body=f"₱{invoice.amount} is due by {invoice.due_date:%b %d, %Y} for {shop.name}.",
        payload={"commission_invoice_id": invoice.id, "shop_id": shop.id},
    )


# --------------------------------------------------------------------------- #
# Payment link
# --------------------------------------------------------------------------- #


def create_invoice_payment_link(invoice: CommissionInvoice) -> str:
    """Create (or reuse) a PayMongo checkout session for the invoice amount and
    return the payment URL. Works in dev-fake mode with no API key.
    """
    if invoice.status != CommissionInvoice.Status.OPEN:
        raise ValueError("Only open invoices can be paid.")

    if invoice.payment_url and invoice.paymongo_session_id:
        return invoice.payment_url

    from apps.payments import paymongo  # local import — avoid app-load cycle

    frontend = get_frontend_url()
    session = paymongo.create_generic_checkout_session(
        amount=invoice.amount,
        description=f"Commission invoice {invoice.period} — {invoice.shop.name}",
        reference=f"commission-invoice-{invoice.id}",
        success_url=f"{frontend}/owner/billing?paid_invoice={invoice.id}",
        cancel_url=f"{frontend}/owner/billing?cancelled_invoice={invoice.id}",
        line_item_name=f"Commission {invoice.period}",
    )
    invoice.paymongo_session_id = session["id"]
    invoice.payment_url = session["url"]
    invoice.raw_payload = session.get("raw", {})
    invoice.save(
        update_fields=["paymongo_session_id", "payment_url", "raw_payload"]
    )
    return invoice.payment_url


# --------------------------------------------------------------------------- #
# Settlement
# --------------------------------------------------------------------------- #


@transaction.atomic
def mark_invoice_paid(
    invoice: CommissionInvoice,
    *,
    raw: dict | None = None,
    settled_offline: bool = False,
    actor=None,
) -> CommissionInvoice:
    """Mark the invoice paid, stamp settled_at on all the shop's still-unsettled
    ledger rows for the period, and auto-resume the shop if it was paused for
    this. Idempotent: a no-op if already paid.
    """
    if invoice.status == CommissionInvoice.Status.PAID:
        return invoice
    if invoice.status == CommissionInvoice.Status.VOID:
        raise ValueError("A void invoice cannot be marked paid.")

    now = timezone.now()
    invoice.status = CommissionInvoice.Status.PAID
    invoice.paid_at = now
    invoice.settled_offline = settled_offline
    if raw is not None:
        invoice.raw_payload = raw
    invoice.save(
        update_fields=["status", "paid_at", "settled_offline", "raw_payload"]
    )

    CommissionLedger.objects.filter(
        shop_id=invoice.shop_id, period=invoice.period, settled_at__isnull=True
    ).update(settled_at=now)

    invoice.shop.refresh_from_db()
    _auto_resume_if_clear(invoice.shop)
    _send_invoice_paid_notice(invoice)
    return invoice


def _send_invoice_paid_notice(invoice: CommissionInvoice) -> None:
    shop = invoice.shop
    owner = shop.owner
    method_label = "settled offline" if invoice.settled_offline else "paid online"
    if owner and owner.email:
        send_template_email(
            to=owner.email,
            subject=f"Commission invoice {invoice.period} settled — {shop.name}",
            text_template="emails/commission_invoice_paid.txt",
            html_template="emails/commission_invoice_paid.html",
            context={
                "owner_name": _owner_name(owner),
                "shop": shop,
                "period": invoice.period,
                "amount": invoice.amount,
                "method_label": method_label,
            },
        )
    _notify_owner(
        shop=shop,
        kind=Notification.Kind.COMMISSION_INVOICE_PAID,
        title=f"Commission invoice {invoice.period} settled",
        body=f"₱{invoice.amount} for {shop.name} is now paid ({method_label}).",
        payload={"commission_invoice_id": invoice.id, "shop_id": shop.id},
    )


@transaction.atomic
def void_invoice(
    invoice: CommissionInvoice, *, actor, reason: str = ""
) -> CommissionInvoice:
    """Void an OPEN invoice. Does NOT settle ledger rows (so they can be
    re-invoiced in a corrected run if needed)."""
    if invoice.status != CommissionInvoice.Status.OPEN:
        raise ValueError("Only open invoices can be voided.")
    invoice.status = CommissionInvoice.Status.VOID
    payload = invoice.raw_payload or {}
    payload["void"] = {
        "reason": reason,
        "by": getattr(actor, "id", None),
        "at": timezone.now().isoformat(),
    }
    invoice.raw_payload = payload
    invoice.save(update_fields=["status", "raw_payload"])
    # Voiding clears any commission-related auto-pause for this shop.
    invoice.shop.refresh_from_db()
    _auto_resume_if_clear(invoice.shop)
    return invoice


# --------------------------------------------------------------------------- #
# Auto-pause / auto-resume + booking guard (reuses Shop.status = PAUSED)
# --------------------------------------------------------------------------- #


def _has_blocking_invoice(shop) -> bool:
    """True if the shop has an OPEN invoice past due_date + grace."""
    cutoff = timezone.now().date() - timedelta(days=_grace_days())
    return CommissionInvoice.objects.filter(
        shop=shop,
        status=CommissionInvoice.Status.OPEN,
        due_date__lt=cutoff,
    ).exists()


def auto_pause_shop_for_unpaid(shop) -> bool:
    """Pause the shop (reusing the existing PAUSED status) because of an overdue
    unpaid invoice. Returns True if it transitioned ACTIVE -> PAUSED."""
    if shop.status != Shop.Status.ACTIVE:
        # Already paused (manually or otherwise) — just record the cause so a
        # later payment can decide whether to resume.
        if not shop.auto_paused_for_unpaid_commission:
            return False
        return False
    shop.status = Shop.Status.PAUSED
    shop.auto_paused_for_unpaid_commission = True
    shop.save(
        update_fields=["status", "auto_paused_for_unpaid_commission", "updated_at"]
    )
    return True


def _auto_resume_if_clear(shop) -> bool:
    """If the shop was auto-paused for billing and no blocking invoice remains,
    flip it back ACTIVE. Never touches an owner-initiated manual pause."""
    if not shop.auto_paused_for_unpaid_commission:
        return False
    if _has_blocking_invoice(shop):
        return False
    shop.auto_paused_for_unpaid_commission = False
    if shop.status == Shop.Status.PAUSED:
        shop.status = Shop.Status.ACTIVE
    shop.save(
        update_fields=["status", "auto_paused_for_unpaid_commission", "updated_at"]
    )
    return True


def assert_shop_not_blocked_for_commission(shop) -> None:
    """Canonical booking-creation guard. Raises ValidationError if the shop has
    an overdue unpaid commission invoice."""
    from rest_framework.exceptions import ValidationError

    if _has_blocking_invoice(shop):
        raise ValidationError(
            "This shop is temporarily unavailable for new bookings "
            "(an outstanding commission invoice must be settled). "
            "Please try again later."
        )


# --------------------------------------------------------------------------- #
# Overdue scanner (called by the daily Beat task)
# --------------------------------------------------------------------------- #


def process_overdue_invoices() -> dict:
    """For OPEN invoices past due: send an escalating reminder (deduped by
    last_reminded_at so the daily run doesn't spam), and once past
    due + grace, auto-pause the shop's new bookings.
    """
    today: date = timezone.now().date()
    grace_cutoff = today - timedelta(days=_grace_days())

    reminded = 0
    paused = 0
    qs = CommissionInvoice.objects.select_related("shop", "shop__owner").filter(
        status=CommissionInvoice.Status.OPEN, due_date__lt=today
    )
    for invoice in qs:
        shop = invoice.shop
        past_grace = invoice.due_date < grace_cutoff

        did_pause = False
        if past_grace:
            did_pause = auto_pause_shop_for_unpaid(shop)
            if did_pause:
                paused += 1

        # One reminder per calendar day at most.
        already_today = (
            invoice.last_reminded_at is not None
            and invoice.last_reminded_at.date() == today
        )
        if not already_today:
            _send_overdue_notice(invoice, paused=past_grace)
            invoice.last_reminded_at = timezone.now()
            invoice.save(update_fields=["last_reminded_at"])
            reminded += 1

    return {"reminded": reminded, "paused": paused}


def _send_overdue_notice(invoice: CommissionInvoice, *, paused: bool) -> None:
    shop = invoice.shop
    owner = shop.owner
    if owner and owner.email:
        send_template_email(
            to=owner.email,
            subject=f"Overdue: commission invoice {invoice.period} — {shop.name}",
            text_template="emails/commission_invoice_overdue.txt",
            html_template="emails/commission_invoice_overdue.html",
            context={
                "owner_name": _owner_name(owner),
                "shop": shop,
                "period": invoice.period,
                "amount": invoice.amount,
                "due_date": invoice.due_date,
                "paused": paused,
                "frontend_url": get_frontend_url(),
            },
        )
    body = (
        f"₱{invoice.amount} for {shop.name} is overdue."
        + (" New bookings are paused until paid." if paused else "")
    )
    _notify_owner(
        shop=shop,
        kind=Notification.Kind.COMMISSION_INVOICE_OVERDUE,
        title=f"Commission invoice {invoice.period} overdue",
        body=body,
        payload={"commission_invoice_id": invoice.id, "shop_id": shop.id},
    )
