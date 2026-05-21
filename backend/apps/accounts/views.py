from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from .emails import send_otp_email, send_password_reset_email, send_verification_email
from .otp import issue_otp, verify_otp
from .serializers import RegisterSerializer, UserSerializer
from .throttles import LoginRateThrottle, PasswordResetRateThrottle, RegisterRateThrottle
from .tokens import (
    consume_email_token,
    consume_reset_token,
    make_email_token,
    make_reset_token,
)

User = get_user_model()


_OTP_ERROR_MESSAGES = {
    "no_active_code": "No active code. Request a new one.",
    "expired": "Code expired. Request a new one.",
    "invalid": "Incorrect code.",
    "too_many_attempts": "Too many attempts. Request a new code.",
    "cooldown": "Please wait a moment before requesting another code.",
}


def _issue_jwt_for(user) -> dict:
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


class ThrottledTokenObtainPairView(TokenObtainPairView):
    """Login endpoint with per-IP rate limiting to blunt credential stuffing."""

    throttle_classes = [LoginRateThrottle]


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [RegisterRateThrottle]

    def perform_create(self, serializer):
        user = serializer.save()
        code, _err = issue_otp(user)
        if code is not None:
            try:
                send_otp_email(user, code)
            except Exception:
                # don't block registration if email send fails — user can request a resend
                pass


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def verify_email(request):
    """Legacy link-based verification (kept for backwards compatibility)."""
    token = request.data.get("token", "")
    user, err = consume_email_token(token)
    if err:
        return Response({"detail": err}, status=status.HTTP_400_BAD_REQUEST)
    if user.email_verified_at is None:
        user.email_verified_at = timezone.now()
        user.save(update_fields=["email_verified_at"])
    return Response({"detail": "verified"})


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def resend_verification(request):
    """Legacy: resend the verification link to the logged-in user."""
    user = request.user
    if user.email_verified_at is not None:
        return Response({"detail": "already verified"})
    try:
        send_verification_email(user, make_email_token(user))
    except Exception:
        return Response({"detail": "email send failed"}, status=502)
    return Response({"detail": "sent"})


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def request_email_otp(request):
    """Issue a fresh 6-digit signup code to the email. Always returns 200 to
    avoid leaking which emails are registered."""
    email = (request.data.get("email") or "").strip().lower()
    if not email:
        return Response({"detail": "email is required"}, status=status.HTTP_400_BAD_REQUEST)
    try:
        user = User.objects.get(email__iexact=email)
    except User.DoesNotExist:
        return Response({"detail": "If that email exists, a code has been sent."})
    if user.email_verified_at is not None:
        return Response({"detail": "already verified"})
    code, err = issue_otp(user)
    if err == "cooldown":
        return Response(
            {"detail": _OTP_ERROR_MESSAGES["cooldown"]},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )
    if code is not None:
        try:
            send_otp_email(user, code)
        except Exception:
            return Response({"detail": "email send failed"}, status=502)
    return Response({"detail": "If that email exists, a code has been sent."})


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def verify_email_otp(request):
    """Verify a 6-digit code. On success, marks email_verified_at and returns JWT tokens
    so the frontend can complete signup without a separate login step."""
    email = (request.data.get("email") or "").strip().lower()
    code = (request.data.get("code") or "").strip()
    if not email or not code:
        return Response(
            {"detail": "email and code are required"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        user = User.objects.get(email__iexact=email)
    except User.DoesNotExist:
        return Response({"detail": _OTP_ERROR_MESSAGES["invalid"]}, status=status.HTTP_400_BAD_REQUEST)

    err = verify_otp(user, code)
    if err is not None:
        return Response(
            {"detail": _OTP_ERROR_MESSAGES.get(err, "Could not verify code.")},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if user.email_verified_at is None:
        user.email_verified_at = timezone.now()
        user.save(update_fields=["email_verified_at"])

    return Response({"detail": "verified", **_issue_jwt_for(user)})


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
@throttle_classes([PasswordResetRateThrottle])
def request_password_reset(request):
    """Always returns 200 — never reveal whether the email is registered."""
    email = (request.data.get("email") or "").strip().lower()
    if email:
        try:
            user = User.objects.get(email__iexact=email)
            send_password_reset_email(user, make_reset_token(user))
        except User.DoesNotExist:
            pass
        except Exception:
            pass
    return Response({"detail": "If that email exists, a reset link has been sent."})


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def confirm_password_reset(request):
    token = request.data.get("token", "")
    new_password = request.data.get("new_password", "")
    if len(new_password) < 8:
        return Response(
            {"detail": "Password must be at least 8 characters."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    user, err = consume_reset_token(token)
    if err:
        return Response({"detail": err}, status=status.HTTP_400_BAD_REQUEST)
    user.set_password(new_password)
    user.save(update_fields=["password"])
    return Response({"detail": "password updated"})
