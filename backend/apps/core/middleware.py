"""Process-level middleware that must run before Django's host validation."""

from __future__ import annotations

from django.http import HttpResponse

HEALTH_PATH = "/health/"


class HealthCheckMiddleware:
    """Answer the load balancer's health probe before ALLOWED_HOSTS is checked.

    The ALB health-checks each ECS task by its raw private IP
    (e.g. http://10.245.5.79:8000/health/). That Host can't be added to
    ALLOWED_HOSTS (it's dynamic and per-task), so once ALLOWED_HOSTS is a
    restrictive list Django would 400 the probe with `Invalid HTTP_HOST header`,
    the task is marked unhealthy, and the deployment never stabilises.

    Registered FIRST in MIDDLEWARE so it short-circuits `/health/` here —
    matching on `request.path` (from PATH_INFO, which never triggers host
    validation) — before SecurityMiddleware/CommonMiddleware ever call
    `request.get_host()`. Real traffic (which arrives via CloudFront with a
    proper Host) is unaffected and still validated against ALLOWED_HOSTS.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path == HEALTH_PATH:
            return HttpResponse("ok")
        return self.get_response(request)
