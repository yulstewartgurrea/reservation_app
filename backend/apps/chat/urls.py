from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ChatRoomViewSet, MessageViewSet, UnreadCountView

router = DefaultRouter()
router.register("rooms", ChatRoomViewSet, basename="chat-room")
router.register("messages", MessageViewSet, basename="chat-message")

urlpatterns = [
    path("unread-count/", UnreadCountView.as_view(), name="chat-unread-count"),
    path("", include(router.urls)),
]
