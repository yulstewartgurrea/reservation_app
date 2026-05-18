"""Tests for the email-OTP flow: issuance, verification, expiry, rate-limit."""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core import mail
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import EmailOTP
from apps.accounts.otp import issue_otp, verify_otp

User = get_user_model()


class IssueOtpTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="otpuser", email="otp@example.com", password="x", role=User.Role.CUSTOMER
        )

    def test_issues_six_digit_code(self):
        code, err = issue_otp(self.user)
        self.assertIsNone(err)
        self.assertEqual(len(code), 6)
        self.assertTrue(code.isdigit())

    def test_persists_hashed_only(self):
        code, _ = issue_otp(self.user)
        otp = EmailOTP.objects.filter(user=self.user).latest("created_at")
        self.assertNotEqual(otp.code_hash, code)
        self.assertGreater(len(otp.code_hash), 20)

    def test_invalidates_prior_unconsumed_codes(self):
        first_code, _ = issue_otp(self.user)
        # advance the clock past the cooldown so the second issue isn't rate-limited
        EmailOTP.objects.filter(user=self.user).update(
            created_at=timezone.now() - timedelta(minutes=5)
        )
        _, _ = issue_otp(self.user)
        # Old code should no longer verify
        self.assertEqual(verify_otp(self.user, first_code), "invalid")

    def test_cooldown_blocks_back_to_back(self):
        issue_otp(self.user)
        _, err = issue_otp(self.user)
        self.assertEqual(err, "cooldown")


class VerifyOtpTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="v", email="v@example.com", password="x", role=User.Role.CUSTOMER
        )

    def test_correct_code_passes(self):
        code, _ = issue_otp(self.user)
        self.assertIsNone(verify_otp(self.user, code))

    def test_wrong_code_increments_attempts(self):
        issue_otp(self.user)
        self.assertEqual(verify_otp(self.user, "000000"), "invalid")
        otp = EmailOTP.objects.filter(user=self.user).latest("created_at")
        self.assertEqual(otp.attempts, 1)

    def test_expired_code_rejected(self):
        code, _ = issue_otp(self.user)
        EmailOTP.objects.filter(user=self.user).update(
            expires_at=timezone.now() - timedelta(seconds=1)
        )
        self.assertEqual(verify_otp(self.user, code), "expired")

    def test_too_many_attempts_locks_the_code(self):
        code, _ = issue_otp(self.user)
        for _ in range(5):
            verify_otp(self.user, "000000")
        # 6th attempt — even with right code — should fail because we hit the cap
        self.assertEqual(verify_otp(self.user, code), "too_many_attempts")

    def test_consumed_code_cannot_be_reused(self):
        code, _ = issue_otp(self.user)
        self.assertIsNone(verify_otp(self.user, code))
        self.assertEqual(verify_otp(self.user, code), "no_active_code")


class OtpEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_register_sends_otp_and_creates_user(self):
        mail.outbox.clear()
        response = self.client.post(
            "/api/auth/register/",
            {
                "email": "new@example.com",
                "confirm_email": "new@example.com",
                "password": "Supersecret9!",
                "confirm_password": "Supersecret9!",
                "role": "customer",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        user = User.objects.get(email="new@example.com")
        self.assertIsNone(user.email_verified_at)
        self.assertTrue(EmailOTP.objects.filter(user=user).exists())
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("verification code", mail.outbox[0].subject.lower())

    def _register(self, **overrides):
        payload = {
            "email": "new@example.com",
            "confirm_email": "new@example.com",
            "password": "Supersecret9!",
            "confirm_password": "Supersecret9!",
            "role": "customer",
        }
        payload.update(overrides)
        return self.client.post("/api/auth/register/", payload, format="json")

    def test_register_rejects_mismatched_email(self):
        response = self._register(confirm_email="other@example.com")
        self.assertEqual(response.status_code, 400)
        self.assertIn("confirm_email", response.json())
        self.assertFalse(User.objects.filter(email="new@example.com").exists())

    def test_register_rejects_mismatched_password(self):
        response = self._register(confirm_password="Different9!")
        self.assertEqual(response.status_code, 400)
        self.assertIn("confirm_password", response.json())
        self.assertFalse(User.objects.filter(email="new@example.com").exists())

    def test_register_rejects_weak_password(self):
        # all lowercase, no number/symbol — fails complexity
        response = self._register(password="weakpassword", confirm_password="weakpassword")
        self.assertEqual(response.status_code, 400)
        self.assertIn("password", response.json())
        self.assertFalse(User.objects.filter(email="new@example.com").exists())

    def test_verify_otp_endpoint_marks_verified_and_returns_tokens(self):
        user = User.objects.create_user(
            username="e", email="e@example.com", password="x", role=User.Role.CUSTOMER
        )
        code, _ = issue_otp(user)
        response = self.client.post(
            "/api/auth/verify-otp/",
            {"email": user.email, "code": code},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertIn("access", body)
        self.assertIn("refresh", body)
        user.refresh_from_db()
        self.assertIsNotNone(user.email_verified_at)

    def test_verify_otp_wrong_code_400(self):
        user = User.objects.create_user(
            username="w", email="w@example.com", password="x", role=User.Role.CUSTOMER
        )
        issue_otp(user)
        response = self.client.post(
            "/api/auth/verify-otp/",
            {"email": user.email, "code": "000000"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_request_otp_does_not_leak_unknown_email(self):
        response = self.client.post(
            "/api/auth/request-otp/", {"email": "nobody@example.com"}, format="json"
        )
        self.assertEqual(response.status_code, 200)

    def test_request_otp_for_already_verified_user_short_circuits(self):
        user = User.objects.create_user(
            username="ver", email="ver@example.com", password="x", role=User.Role.CUSTOMER
        )
        user.email_verified_at = timezone.now()
        user.save(update_fields=["email_verified_at"])
        mail.outbox.clear()
        response = self.client.post(
            "/api/auth/request-otp/", {"email": user.email}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 0)
