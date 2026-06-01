import hashlib
import hmac
import json
import logging

from django.conf import settings
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.reservations.models import CommissionInvoice, Reservation
from apps.reservations.commission_billing import (
    create_invoice_payment_link,
    mark_invoice_paid,
)

from apps.core.emails import get_frontend_url

from .models import Payment
from .services import mark_failed, mark_paid, refund, start_checkout

logger = logging.getLogger(__name__)


def _frontend() -> str:
    return get_frontend_url()


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def start_payment(request, reservation_id: int):
    """Customer-initiated: create or fetch a PayMongo checkout session for a reservation."""
    try:
        reservation = Reservation.objects.select_related("service", "shop").get(pk=reservation_id)
    except Reservation.DoesNotExist:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    if reservation.customer_id != request.user.id:
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
    if reservation.status not in (
        Reservation.Status.PENDING,
        Reservation.Status.CONFIRMED,
    ):
        return Response(
            {"detail": "Cannot pay for a cancelled or completed reservation."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    success_url = f"{_frontend()}/reservations?paid={reservation.id}"
    cancel_url = f"{_frontend()}/reservations?cancelled={reservation.id}"

    payment = start_checkout(
        reservation=reservation,
        success_url=success_url,
        cancel_url=cancel_url,
    )
    return Response(
        {
            "id": payment.id,
            "checkout_url": payment.checkout_url,
            "session_id": payment.provider_session_id,
            "status": payment.status,
        }
    )


def _verify_webhook_signature(request) -> bool:
    secret = getattr(settings, "PAYMONGO_WEBHOOK_SECRET", "")
    if not secret:
        # Dev mode: don't enforce — trust local calls. Log a warning.
        logger.warning("PAYMONGO_WEBHOOK_SECRET not set — accepting webhook without verification.")
        return True

    header = request.headers.get("Paymongo-Signature", "")
    # Header format: "t=<ts>,te=<test_sig>,li=<live_sig>"
    parts = dict(p.split("=", 1) for p in header.split(",") if "=" in p)
    timestamp = parts.get("t", "")
    candidate = parts.get("te") or parts.get("li") or ""
    if not (timestamp and candidate):
        return False

    payload = request.body.decode()
    signed = f"{timestamp}.{payload}"
    expected = hmac.new(secret.encode(), signed.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, candidate)


@csrf_exempt
@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def paymongo_webhook(request):
    if not _verify_webhook_signature(request):
        return HttpResponse(status=400)

    try:
        body = json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return HttpResponse(status=400)

    event = body.get("data", {})
    event_type = event.get("attributes", {}).get("type", "")
    inner = event.get("attributes", {}).get("data", {})
    session_id = inner.get("id") or _extract_session_id(inner)

    if not session_id:
        logger.info("PayMongo webhook %s: no session id; ignoring.", event_type)
        return Response({"detail": "ignored"})

    payment = Payment.objects.filter(provider_session_id=session_id).first()
    if not payment:
        # No reservation Payment for this session — it may be a commission
        # invoice paid via its PayMongo payment link.
        invoice = CommissionInvoice.objects.filter(
            paymongo_session_id=session_id
        ).first()
        if invoice:
            if event_type in ("checkout_session.payment.paid", "payment.paid"):
                mark_invoice_paid(invoice, raw=body, settled_offline=False)
            else:
                logger.info(
                    "PayMongo webhook %s for invoice %s: not a paid event; ignoring.",
                    event_type,
                    invoice.id,
                )
            return Response({"detail": "ok"})
        logger.info("PayMongo webhook %s: unknown session %s; ignoring.", event_type, session_id)
        return Response({"detail": "ignored"})

    if event_type in ("checkout_session.payment.paid", "payment.paid"):
        mark_paid(payment=payment, raw_event=body)
    elif event_type in ("payment.failed", "checkout_session.payment.failed"):
        mark_failed(payment=payment, raw_event=body)
    else:
        logger.info("PayMongo webhook unhandled type: %s", event_type)
    return Response({"detail": "ok"})


def _extract_session_id(inner: dict) -> str:
    """Best-effort: PayMongo nests differently across event types."""
    attrs = inner.get("attributes", {})
    if "checkout_session_id" in attrs:
        return attrs["checkout_session_id"]
    if "data" in attrs and isinstance(attrs["data"], dict):
        return attrs["data"].get("id", "")
    return ""


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def confirm_dev_payment(request, reservation_id: int):
    """Dev-only helper: mark a payment paid without going through PayMongo.

    Available only when PAYMONGO_SECRET_KEY is unset. Useful for local end-to-end tests.
    """
    if getattr(settings, "PAYMONGO_SECRET_KEY", ""):
        return Response({"detail": "Not available in production."}, status=403)

    try:
        reservation = Reservation.objects.get(pk=reservation_id)
    except Reservation.DoesNotExist:
        return Response({"detail": "Not found."}, status=404)
    if reservation.customer_id != request.user.id:
        return Response({"detail": "Forbidden."}, status=403)

    payment = Payment.objects.filter(reservation=reservation).first()
    if not payment:
        return Response({"detail": "No payment session started."}, status=400)
    mark_paid(payment=payment, raw_event={"dev_confirm": True})
    return Response({"detail": "marked paid"})


def _owns_invoice_shop(user, invoice: CommissionInvoice) -> bool:
    return bool(user and user.is_authenticated and invoice.shop.owner_id == user.id)


def _is_admin(user) -> bool:
    return bool(
        user
        and user.is_authenticated
        and (getattr(user, "role", "") == "admin" or user.is_superuser)
    )


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def pay_commission_invoice(request, invoice_id: int):
    """Shop owner: get a PayMongo payment link for one of their own open
    commission invoices. Returns {payment_url}."""
    try:
        invoice = CommissionInvoice.objects.select_related("shop").get(pk=invoice_id)
    except CommissionInvoice.DoesNotExist:
        return Response({"detail": "Not found."}, status=404)

    if not _owns_invoice_shop(request.user, invoice):
        return Response({"detail": "Forbidden."}, status=403)
    if invoice.status != CommissionInvoice.Status.OPEN:
        return Response(
            {"detail": f"Invoice is {invoice.status}; nothing to pay."}, status=400
        )

    try:
        url = create_invoice_payment_link(invoice)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Invoice payment link failed for invoice %s", invoice_id)
        return Response({"detail": str(exc)}, status=502)
    return Response({"payment_url": url})


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def confirm_dev_invoice_payment(request, invoice_id: int):
    """Dev-only: mark a commission invoice paid without going through PayMongo.

    Available only when PAYMONGO_SECRET_KEY is unset. Owner-of-shop or admin.
    """
    if getattr(settings, "PAYMONGO_SECRET_KEY", ""):
        return Response({"detail": "Not available in production."}, status=403)

    try:
        invoice = CommissionInvoice.objects.select_related("shop").get(pk=invoice_id)
    except CommissionInvoice.DoesNotExist:
        return Response({"detail": "Not found."}, status=404)

    if not (_owns_invoice_shop(request.user, invoice) or _is_admin(request.user)):
        return Response({"detail": "Forbidden."}, status=403)
    if invoice.status != CommissionInvoice.Status.OPEN:
        return Response(
            {"detail": f"Invoice is {invoice.status}; nothing to pay."}, status=400
        )

    mark_invoice_paid(invoice, raw={"dev_confirm": True}, settled_offline=False)
    return Response({"detail": "marked paid", "status": invoice.status})


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def refund_payment_view(request, reservation_id: int):
    """Shop-owner-initiated refund. Refunds the full reservation amount via PayMongo,
    then transitions the reservation to cancelled_by_shop with a refund reason.
    """
    try:
        reservation = Reservation.objects.select_related("payment", "shop").get(pk=reservation_id)
    except Reservation.DoesNotExist:
        return Response({"detail": "Not found."}, status=404)

    if not request.user.is_shop_owner or reservation.shop.owner_id != request.user.id:
        return Response({"detail": "Forbidden."}, status=403)

    payment = getattr(reservation, "payment", None)
    if payment is None or payment.status != Payment.Status.PAID:
        return Response({"detail": "No paid payment to refund."}, status=400)

    try:
        refund(payment=payment, reason=request.data.get("reason") or "requested_by_customer")
    except Exception as exc:
        logger.exception("Refund failed for reservation %s", reservation_id)
        return Response({"detail": str(exc)}, status=502)

    # Cancel the reservation if it was still pending/confirmed
    if reservation.status in (Reservation.Status.PENDING, Reservation.Status.CONFIRMED):
        from apps.reservations.services import transition

        transition(
            reservation=reservation,
            to_status=Reservation.Status.CANCELLED_BY_SHOP,
            actor=request.user,
            reason="Refunded by shop",
        )

    return Response({"detail": "refunded", "payment_status": payment.status})
