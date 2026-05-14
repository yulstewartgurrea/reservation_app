"""Email OTP helpers — issue and verify 6-digit signup codes.

Codes are stored hashed (Django's password hasher), expire in OTP_TTL_SECONDS,
and accept up to MAX_ATTEMPTS guesses before being invalidated.
"""

from __future__ import annotations

import secrets
from datetime import timedelta

from django.contrib.auth.hashers import check_password, make_password
from django.db import transaction
from django.utils import timezone

from .models import EmailOTP

OTP_TTL_SECONDS = 60 * 10  # 10 minutes
OTP_RESEND_COOLDOWN_SECONDS = 60  # one new code per minute
MAX_ATTEMPTS = 5


def _generate_code() -> str:
    """Random 6-digit code, zero-padded."""
    return f"{secrets.randbelow(1_000_000):06d}"


def issue_otp(user, purpose: str = EmailOTP.Purpose.SIGNUP) -> tuple[str | None, str | None]:
    """Mint a fresh OTP for the user. Returns (plaintext_code, error).

    Plaintext is only ever returned here — the caller emails it and then
    drops the reference. Subsequent verification works against the hash.
    """
    cooldown_cutoff = timezone.now() - timedelta(seconds=OTP_RESEND_COOLDOWN_SECONDS)
    recent = EmailOTP.objects.filter(
        user=user, purpose=purpose, created_at__gt=cooldown_cutoff
    ).exists()
    if recent:
        return None, "cooldown"

    code = _generate_code()
    with transaction.atomic():
        # Invalidate any prior unconsumed codes for this purpose
        EmailOTP.objects.filter(user=user, purpose=purpose, consumed_at__isnull=True).update(
            consumed_at=timezone.now()
        )
        EmailOTP.objects.create(
            user=user,
            purpose=purpose,
            code_hash=make_password(code),
            expires_at=timezone.now() + timedelta(seconds=OTP_TTL_SECONDS),
        )
    return code, None


def verify_otp(user, code: str, purpose: str = EmailOTP.Purpose.SIGNUP) -> str | None:
    """Verify a submitted code. Returns None on success, error string on failure."""
    otp = (
        EmailOTP.objects.filter(user=user, purpose=purpose, consumed_at__isnull=True)
        .order_by("-created_at")
        .first()
    )
    if otp is None:
        return "no_active_code"
    if otp.expires_at < timezone.now():
        return "expired"
    if otp.attempts >= MAX_ATTEMPTS:
        otp.consumed_at = timezone.now()
        otp.save(update_fields=["consumed_at"])
        return "too_many_attempts"

    if not check_password(code or "", otp.code_hash):
        otp.attempts += 1
        otp.save(update_fields=["attempts"])
        return "invalid"

    otp.consumed_at = timezone.now()
    otp.save(update_fields=["consumed_at"])
    return None
