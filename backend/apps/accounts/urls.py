from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    MeView,
    RegisterView,
    ThrottledTokenObtainPairView,
    confirm_password_reset,
    request_email_otp,
    request_password_reset,
    resend_verification,
    verify_email,
    verify_email_otp,
)

urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("login/", ThrottledTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("me/", MeView.as_view(), name="me"),
    path("verify-email/", verify_email, name="verify_email"),
    path("resend-verification/", resend_verification, name="resend_verification"),
    path("request-otp/", request_email_otp, name="request_email_otp"),
    path("verify-otp/", verify_email_otp, name="verify_email_otp"),
    path("password/reset/", request_password_reset, name="password_reset"),
    path("password/reset/confirm/", confirm_password_reset, name="password_reset_confirm"),
]
