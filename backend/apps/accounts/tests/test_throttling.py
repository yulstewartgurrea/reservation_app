"""Rate-limit tests for the auth endpoints.

Throttling is disabled in test_settings by default (rates = None) so existing
tests can register/login many times from one IP. Here we set low rates directly
on the throttle classes — DRF binds THROTTLE_RATES as a class attribute at import
time, so override_settings on the rates dict wouldn't reach it; a class-level
`rate` attribute is honoured by SimpleRateThrottle.__init__ instead. The throttle
cache is cleared in setUp so the per-IP counters start fresh.
"""

from unittest import mock

from django.core.cache import cache
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.throttles import (
    LoginRateThrottle,
    PasswordResetRateThrottle,
    RegisterRateThrottle,
)
from apps.core.test_factories import make_user


class AuthThrottleTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        # Low, fast rates for the test. create=True because `rate` is normally an
        # instance attr set from settings, not a class attr.
        for cls, rate in (
            (LoginRateThrottle, "3/min"),
            (RegisterRateThrottle, "2/min"),
            (PasswordResetRateThrottle, "2/min"),
        ):
            patcher = mock.patch.object(cls, "rate", rate, create=True)
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_login_throttled_after_limit(self):
        make_user(role="customer", email="rl@example.com")
        url = reverse("token_obtain_pair")
        payload = {"email": "rl@example.com", "password": "wrong-password"}
        # First 3 attempts are allowed (and rejected as bad creds, 401).
        for _ in range(3):
            resp = self.client.post(url, payload)
            self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)
        # 4th within the window is rate-limited.
        resp = self.client.post(url, payload)
        self.assertEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_register_throttled_after_limit(self):
        url = reverse("register")

        def body(n):
            return {
                "email": f"u{n}@example.com",
                "confirm_email": f"u{n}@example.com",
                "password": "Str0ngPass!9",
                "confirm_password": "Str0ngPass!9",
                "role": "customer",
            }

        self.assertEqual(self.client.post(url, body(1)).status_code, status.HTTP_201_CREATED)
        self.assertEqual(self.client.post(url, body(2)).status_code, status.HTTP_201_CREATED)
        # 3rd registration from the same IP within the window is blocked.
        self.assertEqual(
            self.client.post(url, body(3)).status_code, status.HTTP_429_TOO_MANY_REQUESTS
        )

    def test_password_reset_throttled_after_limit(self):
        url = reverse("password_reset")
        payload = {"email": "nobody@example.com"}
        # The endpoint always 200s (no account-existence leak) until throttled.
        self.assertEqual(self.client.post(url, payload).status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.post(url, payload).status_code, status.HTTP_200_OK)
        self.assertEqual(
            self.client.post(url, payload).status_code, status.HTTP_429_TOO_MANY_REQUESTS
        )

    def test_throttle_scopes_are_independent(self):
        # Exhausting password-reset must not affect login.
        reset_url = reverse("password_reset")
        for _ in range(3):
            self.client.post(reset_url, {"email": "x@example.com"})
        make_user(role="customer", email="indep@example.com", password="testpw1234")
        resp = self.client.post(
            reverse("token_obtain_pair"),
            {"email": "indep@example.com", "password": "testpw1234"},
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
