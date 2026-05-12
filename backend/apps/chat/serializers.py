from rest_framework import serializers

from .models import ChatRoom, Message
from .services import unread_count_for_room


class MessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = (
            "id",
            "room",
            "sender",
            "sender_name",
            "body",
            "edited_at",
            "is_deleted",
            "created_at",
        )
        read_only_fields = (
            "id",
            "room",
            "sender",
            "sender_name",
            "edited_at",
            "is_deleted",
            "created_at",
        )

    def get_sender_name(self, obj) -> str:
        u = obj.sender
        return (u.get_full_name() or u.email).strip()


class ChatRoomSerializer(serializers.ModelSerializer):
    shop_name = serializers.CharField(source="shop.name", read_only=True)
    customer_name = serializers.SerializerMethodField()
    other_party_name = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()

    class Meta:
        model = ChatRoom
        fields = (
            "id",
            "customer",
            "shop",
            "shop_name",
            "customer_name",
            "other_party_name",
            "created_at",
            "last_message_at",
            "unread_count",
            "last_message",
        )
        read_only_fields = fields

    def _request_user(self):
        request = self.context.get("request")
        return getattr(request, "user", None)

    def get_customer_name(self, obj) -> str:
        u = obj.customer
        return (u.get_full_name() or u.email).strip()

    def get_other_party_name(self, obj) -> str:
        user = self._request_user()
        if user and user.id == obj.customer_id:
            return obj.shop.name
        return self.get_customer_name(obj)

    def get_unread_count(self, obj) -> int:
        user = self._request_user()
        if not user or not user.is_authenticated:
            return 0
        return unread_count_for_room(room=obj, user=user)

    def get_last_message(self, obj):
        msg = obj.messages.order_by("-created_at").first()
        if not msg:
            return None
        return {
            "id": msg.id,
            "body": msg.body[:200],
            "sender_id": msg.sender_id,
            "created_at": msg.created_at.isoformat(),
            "edited_at": msg.edited_at.isoformat() if msg.edited_at else None,
        }


class OpenRoomSerializer(serializers.Serializer):
    shop = serializers.IntegerField()


class SendMessageSerializer(serializers.Serializer):
    body = serializers.CharField(max_length=4000)


class EditMessageSerializer(serializers.Serializer):
    body = serializers.CharField(max_length=4000)


class MarkReadSerializer(serializers.Serializer):
    message_id = serializers.IntegerField()


class MarkUnreadSerializer(serializers.Serializer):
    message_id = serializers.IntegerField()
