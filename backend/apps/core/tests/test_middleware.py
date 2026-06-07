"""HealthCheckMiddleware: /health/ must bypass ALLOWED_HOSTS; nothing else may."""

from __future__ import annotations

from django.test import TestCase, override_settings


@override_settings(ALLOWED_HOSTS=["bookme.ph"])
class HealthCheckMiddlewareTests(TestCase):
    def test_health_passes_with_a_disallowed_host(self):
        # Mimics the ALB probing a task by its raw private IP — a Host that is
        # deliberately NOT in ALLOWED_HOSTS must still get a 200.
        resp = self.client.get("/health/", HTTP_HOST="10.245.5.79:8000")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.content, b"ok")

    def test_health_passes_with_an_allowed_host(self):
        resp = self.client.get("/health/", HTTP_HOST="bookme.ph")
        self.assertEqual(resp.status_code, 200)

    def test_other_paths_still_reject_a_disallowed_host(self):
        # The bypass is scoped to /health/ only — real traffic stays host-checked.
        resp = self.client.get("/api/services/", HTTP_HOST="10.245.5.79:8000")
        self.assertEqual(resp.status_code, 400)
