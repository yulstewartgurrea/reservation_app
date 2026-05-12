"""Payment-side business logic. Reservation lifecycle effects live in
apps.reservations.services; this module is the bridge between PayMongo events
and our domain model.
"""

from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from apps.reservations.models import Reservation
from apps.reservations.services import transition

from .models import Payment
from . import paymongo


@transaction.atomic
def start_checkout(*, reservation: Reservation, success_url: str, cancel_url: str) -> Payment:
    """Idempotent: returns the existing pending Payment if one exists; otherwise creates."""
    existing = Payment.objects.filter(reservation=reservation).first()
    if existing and existing.status == Payment.Status.PAID:
        return existing
    if existing and existing.checkout_url and existing.status == Payment.Status.PENDING:
        return existing

    session = paymongo.create_checkout_session(
        reservation=reservation,
        success_url=success_url,
        cancel_url=cancel_url,
    )
    payment, _ = Payment.objects.update_or_create(
        reservation=reservation,
        defaults={
            "provider": Payment.Provider.PAYMONGO,
            "provider_session_id": session["id"],
            "checkout_url": session["url"],
            "amount": reservation.total_price,
            "currency": "PHP",
            "status": Payment.Status.PENDING,
            "raw_payload": session.get("raw", {}),
        },
    )
    return payment


@transaction.atomic
def mark_paid(*, payment: Payment, raw_event: dict | None = None) -> Payment:
    if payment.status == Payment.Status.PAID:
        return payment
    payment.status = Payment.Status.PAID
    payment.paid_at = timezone.now()
    if raw_event is not None:
        payment.raw_payload = raw_event
    payment.save(update_fields=["status", "paid_at", "raw_payload", "updated_at"])

    reservation = payment.reservation
    if reservation.status == Reservation.Status.PENDING:
        transition(
            reservation=reservation,
            to_status=Reservation.Status.CONFIRMED,
            actor=None,
            reason="Auto-confirmed by PayMongo payment",
        )
    return payment


@transaction.atomic
def mark_failed(*, payment: Payment, raw_event: dict | None = None) -> Payment:
    payment.status = Payment.Status.FAILED
    if raw_event is not None:
        payment.raw_payload = raw_event
    payment.save(update_fields=["status", "raw_payload", "updated_at"])
    return payment


@transaction.atomic
def refund(*, payment: Payment, reason: str = "requested_by_customer") -> Payment:
    """Issue a full refund for a paid payment, then mark it refunded locally."""
    if payment.status != Payment.Status.PAID:
        raise ValueError("Only paid payments can be refunded.")

    centavos = paymongo.to_centavos(payment.amount)
    underlying_id = _extract_underlying_payment_id(payment) or payment.provider_session_id
    response = paymongo.refund_payment(underlying_id, amount_centavos=centavos, reason=reason)

    payment.status = Payment.Status.REFUNDED
    payment.raw_payload = {**(payment.raw_payload or {}), "refund": response}
    payment.save(update_fields=["status", "raw_payload", "updated_at"])
    return payment


def _extract_underlying_payment_id(payment: Payment) -> str | None:
    """The PayMongo payment id (not session id) lives inside the webhook payload.

    Falls back to None if we can't pluck it; callers then use the session id which
    is fine in dev mode since the dev refund just acknowledges.
    """
    raw = payment.raw_payload or {}
    inner = raw.get("data", {}).get("attributes", {}).get("data", {})
    if isinstance(inner, dict) and inner.get("id"):
        return inner.get("id")
    return None
