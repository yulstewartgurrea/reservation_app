from django.conf import settings
from django.db import models


class ChatRoom(models.Model):
    """A 1:1 conversation between a customer and a shop (owner replies on behalf of the shop)."""

    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="customer_chat_rooms",
    )
    shop = models.ForeignKey(
        "shops.Shop",
        on_delete=models.CASCADE,
        related_name="chat_rooms",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    last_message_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = [("customer", "shop")]
        ordering = ["-last_message_at", "-created_at"]
        indexes = [
            models.Index(fields=["customer", "-last_message_at"]),
            models.Index(fields=["shop", "-last_message_at"]),
        ]

    def __str__(self) -> str:
        return f"Chat<{self.customer_id}↔shop:{self.shop_id}>"


class Message(models.Model):
    class AttachmentKind(models.TextChoices):
        IMAGE = "image", "Image"
        VIDEO = "video", "Video"
        FILE = "file", "File"

    room = models.ForeignKey(ChatRoom, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="chat_messages",
    )
    body = models.TextField(blank=True)
    attachment = models.FileField(upload_to="chat/%Y/%m/", null=True, blank=True)
    attachment_kind = models.CharField(
        max_length=8, choices=AttachmentKind.choices, blank=True
    )
    attachment_name = models.CharField(max_length=255, blank=True)
    attachment_size = models.PositiveIntegerField(null=True, blank=True)
    attachment_mime = models.CharField(max_length=128, blank=True)
    edited_at = models.DateTimeField(null=True, blank=True)
    is_deleted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [models.Index(fields=["room", "created_at"])]

    def __str__(self) -> str:
        return f"Msg<{self.id} room:{self.room_id} from:{self.sender_id}>"


class ChatParticipant(models.Model):
    """Per-user read state inside a room.

    `last_read_message` is the *highest* message the user has seen.
    Unread = messages in the room with id > last_read_message_id AND sender != self.
    To "mark unread" a specific message, we set last_read_message to that message's
    predecessor — so the target and everything after are counted as unread again.
    """

    room = models.ForeignKey(ChatRoom, on_delete=models.CASCADE, related_name="participants")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="chat_participants",
    )
    last_read_message = models.ForeignKey(
        Message,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("room", "user")]
        indexes = [models.Index(fields=["user", "room"])]

    def __str__(self) -> str:
        return f"Participant<room:{self.room_id} user:{self.user_id}>"
