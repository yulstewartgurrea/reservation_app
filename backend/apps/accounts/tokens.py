"""Tokens for email verification and password reset.

Both are stateless: we use Django's signing module so we don't need a separate
DB table to store tokens. Each token includes a user id and a salt; verification
mints a max-age check.
"""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner

EMAIL_SALT = "accounts.email-verify"
RESET_SALT = "accounts.password-reset"

EMAIL_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 3  # 3 days
RESET_TOKEN_TTL_SECONDS = 60 * 60  # 1 hour


def make_email_token(user) -> str:
    return TimestampSigner(salt=EMAIL_SALT).sign(str(user.pk))


def consume_email_token(token: str):
    try:
        raw = TimestampSigner(salt=EMAIL_SALT).unsign(token, max_age=EMAIL_TOKEN_TTL_SECONDS)
    except SignatureExpired:
        return None, "expired"
    except BadSignature:
        return None, "invalid"
    User = get_user_model()
    try:
        return User.objects.get(pk=int(raw)), None
    except (User.DoesNotExist, ValueError):
        return None, "invalid"


def make_reset_token(user) -> str:
    return TimestampSigner(salt=RESET_SALT).sign(f"{user.pk}:{user.password[-12:]}")


def consume_reset_token(token: str):
    try:
        raw = TimestampSigner(salt=RESET_SALT).unsign(token, max_age=RESET_TOKEN_TTL_SECONDS)
    except SignatureExpired:
        return None, "expired"
    except BadSignature:
        return None, "invalid"
    try:
        user_id, pw_fingerprint = raw.split(":", 1)
    except ValueError:
        return None, "invalid"
    User = get_user_model()
    try:
        user = User.objects.get(pk=int(user_id))
    except (User.DoesNotExist, ValueError):
        return None, "invalid"
    if user.password[-12:] != pw_fingerprint:
        # password changed since this token was issued — invalidate
        return None, "expired"
    return user, None
