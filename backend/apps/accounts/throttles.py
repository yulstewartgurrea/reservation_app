"""Rate throttles for unauthenticated auth endpoints.

These subclass AnonRateThrottle so they key on client IP (only meaningful for
anonymous requests, which login/register/password-reset always are). Rates live
in settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] under the matching scope.

NOTE: behind a proxy (CloudFront -> ALB -> ECS) the throttle key is the client
IP, which DRF resolves from X-Forwarded-For only when REST_FRAMEWORK["NUM_PROXIES"]
is set correctly. Without it every request shares one bucket. See SECURITY_FINDINGS.md.
"""

from rest_framework.throttling import AnonRateThrottle


class LoginRateThrottle(AnonRateThrottle):
    scope = "login"


class RegisterRateThrottle(AnonRateThrottle):
    scope = "register"


class PasswordResetRateThrottle(AnonRateThrottle):
    scope = "password_reset"
