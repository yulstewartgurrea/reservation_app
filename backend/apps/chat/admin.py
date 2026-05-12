from django.contrib import admin

from .models import ChatParticipant, ChatRoom, Message


@admin.register(ChatRoom)
class ChatRoomAdmin(admin.ModelAdmin):
    list_display = ("id", "customer", "shop", "last_message_at", "created_at")
    list_select_related = ("customer", "shop")
    search_fields = ("customer__email", "shop__name")


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ("id", "room", "sender", "created_at", "edited_at", "is_deleted")
    list_select_related = ("room", "sender")
    search_fields = ("sender__email", "body")


@admin.register(ChatParticipant)
class ChatParticipantAdmin(admin.ModelAdmin):
    list_display = ("id", "room", "user", "last_read_message_id", "joined_at")
    list_select_related = ("room", "user")
