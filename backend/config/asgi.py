import os
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter

from apps.chat.routing import websocket_urlpatterns as chat_ws_urlpatterns
from apps.notifications.routing import websocket_urlpatterns as notifications_ws_urlpatterns
from config.ws_auth import JWTAuthMiddleware

websocket_urlpatterns = notifications_ws_urlpatterns + chat_ws_urlpatterns

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": JWTAuthMiddleware(URLRouter(websocket_urlpatterns)),
})
