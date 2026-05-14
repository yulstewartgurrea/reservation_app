from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.shops.models import Shop

from . import services
from .models import ChatRoom, Message
from .serializers import (
    ChatRoomSerializer,
    EditMessageSerializer,
    MarkReadSerializer,
    MarkUnreadSerializer,
    MessageSerializer,
    OpenRoomSerializer,
    SendMessageSerializer,
)


class ChatRoomViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ChatRoomSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return services.list_rooms_for_user(user=self.request.user)

    def create(self, request, *args, **kwargs):
        """Customer opens (or re-opens) a chat with a shop."""
        s = OpenRoomSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        if not request.user.is_customer:
            raise PermissionDenied("Only customers can open a chat with a shop.")
        shop = get_object_or_404(Shop, pk=s.validated_data["shop"])
        try:
            room = services.open_room_for_customer(customer=request.user, shop=shop)
        except PermissionError as exc:
            raise PermissionDenied(str(exc))
        out = ChatRoomSerializer(room, context={"request": request})
        return Response(out.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get", "post"], url_path="messages")
    def messages(self, request, pk=None):
        room = self.get_object()
        if request.method == "GET":
            # Chat pagination is "latest N, oldest at the top" — opening a room
            # should always show the most recent messages, not the first 20 ever
            # sent. We fetch the newest N by id (created_at), then reverse so
            # the client renders them in chronological order. Use `?before=<id>`
            # to walk further back.
            try:
                limit = max(1, min(int(request.query_params.get("limit", 50)), 200))
            except (TypeError, ValueError):
                limit = 50
            qs = Message.objects.filter(room=room).order_by("-id")
            before = request.query_params.get("before")
            if before:
                try:
                    qs = qs.filter(id__lt=int(before))
                except (TypeError, ValueError):
                    pass
            rows = list(qs[:limit])
            rows.reverse()
            ser = MessageSerializer(rows, many=True, context={"request": request})
            return Response(ser.data)
        # POST: send a message (multipart-aware so clients can attach files)
        s = SendMessageSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        try:
            msg = services.send_message(
                room=room,
                sender=request.user,
                body=s.validated_data.get("body", ""),
                attachment=s.validated_data.get("attachment"),
            )
        except ValueError as exc:
            raise ValidationError(str(exc))
        except PermissionError as exc:
            raise PermissionDenied(str(exc))
        return Response(
            MessageSerializer(msg, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="read")
    def mark_read(self, request, pk=None):
        room = self.get_object()
        s = MarkReadSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        try:
            participant = services.mark_read_up_to(
                room=room, user=request.user, message_id=s.validated_data["message_id"]
            )
        except Message.DoesNotExist:
            raise ValidationError("Message not found in this room.")
        return Response(
            {"last_read_message_id": participant.last_read_message_id}
        )

    @action(detail=True, methods=["post"], url_path="unread")
    def mark_unread(self, request, pk=None):
        room = self.get_object()
        s = MarkUnreadSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        try:
            participant = services.mark_unread_from(
                room=room, user=request.user, message_id=s.validated_data["message_id"]
            )
        except Message.DoesNotExist:
            raise ValidationError("Message not found in this room.")
        return Response(
            {"last_read_message_id": participant.last_read_message_id}
        )

    def get_object(self):
        room = super().get_object()
        if not services.user_can_access_room(self.request.user, room):
            raise PermissionDenied("Not a participant of this room.")
        return room


class MessageViewSet(viewsets.GenericViewSet):
    """Standalone endpoint to edit a single message by its id."""

    serializer_class = MessageSerializer
    permission_classes = [permissions.IsAuthenticated]
    queryset = Message.objects.all()

    def get_queryset(self):
        user = self.request.user
        return Message.objects.filter(
            Q(room__customer=user) | Q(room__shop__owner=user)
        ).select_related("room", "room__shop")

    def partial_update(self, request, pk=None):
        message = get_object_or_404(self.get_queryset(), pk=pk)
        s = EditMessageSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        try:
            message = services.edit_message(
                message=message, user=request.user, body=s.validated_data["body"]
            )
        except ValueError as exc:
            raise ValidationError(str(exc))
        except PermissionError as exc:
            raise PermissionDenied(str(exc))
        return Response(MessageSerializer(message).data)


class UnreadCountView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response({"unread": services.total_unread_for_user(user=request.user)})
