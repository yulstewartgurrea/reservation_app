"""Tests for the email-verification + password-reset token helpers and endpoints."""

from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.tokens import (
    consume_email_token,
    consume_reset_token,
    make_email_token,
    make_reset_token,
)

User = get_user_model()


class EmailTokenTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="alice", email="a@example.com", password="x", role=User.Role.CUSTOMER
        )

    def test_round_trip(self):
        token = make_email_token(self.user)
        result, err = consume_email_token(token)
        self.assertIsNone(err)
        self.assertEqual(result, self.user)

    def test_garbage_token_invalid(self):
        result, err = consume_email_token("not-a-real-token")
        self.assertIsNone(result)
        self.assertEqual(err, "invalid")

    def test_expired_token_rejected(self):
        token = make_email_token(self.user)
        # patch the global signer's max-age check by tampering with timezone
        with patch("django.core.signing.time.time", return_value=timezone.now().timestamp() + 86400 * 4):
            result, err = consume_email_token(token)
            self.assertIsNone(result)
            self.assertEqual(err, "expired")


class ResetTokenTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="bob", email="b@example.com", password="originalpw1", role=User.Role.CUSTOMER
        )

    def test_round_trip(self):
        token = make_reset_token(self.user)
        result, err = consume_reset_token(token)
        self.assertIsNone(err)
        self.assertEqual(result, self.user)

    def test_password_change_invalidates_existing_token(self):
        token = make_reset_token(self.user)
        self.user.set_password("newpassword2")
        self.user.save()
        result, err = consume_reset_token(token)
        self.assertIsNone(result)
        self.assertEqual(err, "expired")


class AuthEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="carla",
            email="c@example.com",
            password="originalpw1",
            role=User.Role.CUSTOMER,
        )

    def test_verify_email_endpoint_marks_user_verified(self):
        token = make_email_token(self.user)
        self.assertIsNone(self.user.email_verified_at)
        response = self.client.post(
            "/api/auth/verify-email/", {"token": token}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertIsNotNone(self.user.email_verified_at)

    def test_password_reset_request_does_not_leak(self):
        # Both an existing and a missing email should return 200 with the same shape.
        for email in ("c@example.com", "no@example.com"):
            response = self.client.post(
                "/api/auth/password/reset/", {"email": email}, format="json"
            )
            self.assertEqual(response.status_code, 200)

    def test_password_reset_confirm_changes_password(self):
        token = make_reset_token(self.user)
        response = self.client.post(
            "/api/auth/password/reset/confirm/",
            {"token": token, "new_password": "brandnewpw9"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("brandnewpw9"))

    def test_password_reset_confirm_rejects_short_password(self):
        token = make_reset_token(self.user)
        response = self.client.post(
            "/api/auth/password/reset/confirm/",
            {"token": token, "new_password": "short"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
