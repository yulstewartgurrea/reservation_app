from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .views import (
    MeView,
    RegisterView,
    confirm_password_reset,
    request_password_reset,
    resend_verification,
    verify_email,
)

urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("login/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("me/", MeView.as_view(), name="me"),
    path("verify-email/", verify_email, name="verify_email"),
    path("resend-verification/", resend_verification, name="resend_verification"),
    path("password/reset/", request_password_reset, name="password_reset"),
    path("password/reset/confirm/", confirm_password_reset, name="password_reset_confirm"),
]
