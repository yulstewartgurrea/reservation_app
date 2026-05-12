"""Thin PayMongo API client.

PayMongo (https://developers.paymongo.com) is the only supported provider in v1.
Auth is HTTP Basic with the secret key as the username and an empty password.

Amounts are submitted in **centavos** (1 PHP = 100 centavos), so we multiply by
100 and cast to int.

If `PAYMONGO_SECRET_KEY` is unset (e.g. local dev without a sandbox account),
``create_checkout_session`` returns a sentinel "dev mode" session with a fake
URL so the booking flow still works end-to-end. The webhook handler is then
expected to be triggered manually for testing.
"""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any
import uuid

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

PAYMONGO_BASE = "https://api.paymongo.com/v1"
DEV_FAKE_PREFIX = "dev_fake_"


class PayMongoError(Exception):
    pass


def _auth():
    key = getattr(settings, "PAYMONGO_SECRET_KEY", "") or ""
    return (key, "") if key else None


def _is_configured() -> bool:
    return bool(getattr(settings, "PAYMONGO_SECRET_KEY", ""))


def to_centavos(amount: Decimal | str | float) -> int:
    return int((Decimal(str(amount)) * 100).to_integral_value())


def create_checkout_session(
    *,
    reservation,
    success_url: str,
    cancel_url: str,
    description: str = "",
) -> dict[str, Any]:
    """Create a PayMongo Checkout Session for a reservation.

    Returns a dict with at least: id, url, raw.
    """
    if not _is_configured():
        fake_id = f"{DEV_FAKE_PREFIX}{uuid.uuid4().hex[:24]}"
        logger.warning(
            "PAYMONGO_SECRET_KEY not set — returning a dev-fake checkout session for reservation %s",
            reservation.id,
        )
        return {
            "id": fake_id,
            "url": f"{success_url}?session_id={fake_id}&dev=1",
            "raw": {"dev_mode": True},
        }

    payload = {
        "data": {
            "attributes": {
                "send_email_receipt": True,
                "show_description": bool(description),
                "show_line_items": True,
                "description": description or f"Reservation #{reservation.id}",
                "line_items": [
                    {
                        "currency": "PHP",
                        "amount": to_centavos(reservation.total_price),
                        "name": reservation.service.name,
                        "quantity": 1,
                    }
                ],
                "payment_method_types": ["card", "gcash", "grab_pay", "paymaya"],
                "success_url": success_url,
                "cancel_url": cancel_url,
                "reference_number": f"reservation-{reservation.id}",
            }
        }
    }
    response = requests.post(
        f"{PAYMONGO_BASE}/checkout_sessions",
        json=payload,
        auth=_auth(),
        timeout=10,
    )
    if response.status_code >= 400:
        logger.error("PayMongo checkout error %s: %s", response.status_code, response.text)
        raise PayMongoError(response.text)
    data = response.json().get("data", {})
    attributes = data.get("attributes", {})
    return {
        "id": data.get("id"),
        "url": attributes.get("checkout_url", ""),
        "raw": data,
    }


def retrieve_checkout_session(session_id: str) -> dict[str, Any]:
    if not _is_configured() or session_id.startswith(DEV_FAKE_PREFIX):
        return {"data": {"id": session_id, "attributes": {"payment_intent": {"attributes": {"status": "succeeded"}}}}}
    response = requests.get(
        f"{PAYMONGO_BASE}/checkout_sessions/{session_id}",
        auth=_auth(),
        timeout=10,
    )
    if response.status_code >= 400:
        raise PayMongoError(response.text)
    return response.json()


def refund_payment(
    payment_id: str,
    *,
    amount_centavos: int,
    reason: str = "requested_by_customer",
) -> dict[str, Any]:
    """Refund a paid PayMongo payment.

    `payment_id` is the underlying payment id (extracted from the webhook payload),
    not the checkout session id. In dev mode (no API key) we return a fake acknowledgement
    so the lifecycle is testable end-to-end.
    """
    if not _is_configured() or payment_id.startswith(DEV_FAKE_PREFIX):
        logger.warning("PayMongo refund called in dev mode for %s", payment_id)
        return {"data": {"id": f"refund_dev_{payment_id}", "attributes": {"status": "succeeded"}}}

    payload = {
        "data": {
            "attributes": {
                "amount": amount_centavos,
                "payment_id": payment_id,
                "reason": reason,
            }
        }
    }
    response = requests.post(
        f"{PAYMONGO_BASE}/refunds",
        json=payload,
        auth=_auth(),
        timeout=10,
    )
    if response.status_code >= 400:
        logger.error("PayMongo refund error %s: %s", response.status_code, response.text)
        raise PayMongoError(response.text)
    return response.json()
