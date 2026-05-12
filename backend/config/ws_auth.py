"""WebSocket auth middleware: pull JWT from `?token=...` query string."""

from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import UntypedToken


@database_sync_to_async
def _get_user(user_id):
    User = get_user_model()
    try:
        return User.objects.get(id=user_id)
    except User.DoesNotExist:
        return AnonymousUser()


class JWTAuthMiddleware:
    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        token = None
        qs = parse_qs(scope.get("query_string", b"").decode())
        if "token" in qs:
            token = qs["token"][0]

        if token:
            try:
                validated = UntypedToken(token)
                user_id = validated["user_id"]
                scope["user"] = await _get_user(user_id)
            except (InvalidToken, TokenError, KeyError):
                scope["user"] = AnonymousUser()
        else:
            scope["user"] = AnonymousUser()

        return await self.inner(scope, receive, send)
