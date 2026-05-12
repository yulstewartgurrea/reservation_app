from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .emails import send_password_reset_email, send_verification_email
from .serializers import RegisterSerializer, UserSerializer
from .tokens import (
    consume_email_token,
    consume_reset_token,
    make_email_token,
    make_reset_token,
)

User = get_user_model()


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]

    def perform_create(self, serializer):
        user = serializer.save()
        try:
            send_verification_email(user, make_email_token(user))
        except Exception:
            # don't block registration if email send fails
            pass


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def verify_email(request):
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
