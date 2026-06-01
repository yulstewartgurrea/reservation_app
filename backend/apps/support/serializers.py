"""DRF serializers for the support module.

Writes never carry business logic — the view validates input shape and
forwards to a service. The serializers are deliberately split (list vs.
detail vs. create vs. message vs. event) so each response payload is as
small as it can be.
"""

from __future__ import annotations

from rest_framework import serializers

from apps.reservations.models import Reservation
from apps.shops.models import Shop

from .models import (
    Ticket,
    TicketAttachment,
    TicketEvent,
    TicketMessage,
)


class _MinimalUserSerializer(serializers.Serializer):
    """Just enough to render an avatar+name without exposing the full user."""

    id = serializers.IntegerField(read_only=True)
    email = serializers.EmailField(read_only=True)
    first_name = serializers.CharField(read_only=True)
    last_name = serializers.CharField(read_only=True)
    role = serializers.CharField(read_only=True)
    display_name = serializers.SerializerMethodField()

    def get_display_name(self, obj) -> str:
        if obj is None:
            return ""
        full = f"{obj.first_name} {obj.last_name}".strip()
        if full:
            return full
        return obj.username or obj.email.split("@")[0]


def _user_dict_or_none(user):
    if user is None:
        return None
    return _MinimalUserSerializer(user).data


class TicketAttachmentSerializer(serializers.ModelSerializer):
    file = serializers.SerializerMethodField()

    class Meta:
        model = TicketAttachment
        fields = (
            "id",
            "file",
            "original_name",
            "content_type",
            "size",
            "uploaded_at",
        )
        read_only_fields = fields

    def get_file(self, obj) -> str | None:
        if not obj.file:
            return None
        try:
            return obj.file.url
        except Exception:  # noqa: BLE001 — storage backend may raise
            return None


class TicketMessageSerializer(serializers.ModelSerializer):
    """Read-shape for a ticket message.

    Note: write paths go through `services.add_message`, not this serializer
    — the view assembles fields and calls the service directly. Keeping a
    one-direction serializer avoids two sources of truth for "what counts
    as a valid message".
    """

    author = serializers.SerializerMethodField()
    attachments = TicketAttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = TicketMessage
        fields = (
            "id",
            "author",
            "body",
            "is_internal",
            "created_at",
            "attachments",
        )
        read_only_fields = fields

    def get_author(self, obj):
        return _user_dict_or_none(obj.author)


class TicketEventSerializer(serializers.ModelSerializer):
    """Audit log entries. Admin-only — never returned to non-admins."""

    actor = serializers.SerializerMethodField()

    class Meta:
        model = TicketEvent
        fields = ("id", "event_type", "actor", "payload", "created_at")
        read_only_fields = fields

    def get_actor(self, obj):
        return _user_dict_or_none(obj.actor)


class _RelatedReservationSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    reference = serializers.SerializerMethodField()

    def get_reference(self, obj) -> str:
        return f"RSV-{obj.id:06d}"


class _RelatedShopSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    name = serializers.CharField(read_only=True)


class TicketListSerializer(serializers.ModelSerializer):
    submitter = serializers.SerializerMethodField()
    assigned_to = serializers.SerializerMethodField()

    class Meta:
        model = Ticket
        fields = (
            "id",
            "subject",
            "category",
            "status",
            "priority",
            "submitter",
            "assigned_to",
            "last_message_at",
            "created_at",
        )
        read_only_fields = fields

    def get_submitter(self, obj):
        return _user_dict_or_none(obj.submitter)

    def get_assigned_to(self, obj):
        return _user_dict_or_none(obj.assigned_to)


class TicketDetailSerializer(serializers.ModelSerializer):
    """Full ticket view.

    The view layer is responsible for filtering `is_internal=True` messages
    and for stripping `events` for non-admin requesters. We don't put that
    logic in the serializer because the request user isn't always passed
    in context, and a missing context shouldn't silently leak data.
    """

    submitter = serializers.SerializerMethodField()
    assigned_to = serializers.SerializerMethodField()
    related_reservation = serializers.SerializerMethodField()
    related_shop = serializers.SerializerMethodField()
    messages = serializers.SerializerMethodField()
    events = serializers.SerializerMethodField()

    class Meta:
        model = Ticket
        fields = (
            "id",
            "subject",
            "body",
            "category",
            "status",
            "priority",
            "submitter",
            "assigned_to",
            "related_reservation",
            "related_shop",
            "messages",
            "events",
            "last_message_at",
            "created_at",
            "updated_at",
            "resolved_at",
        )
        read_only_fields = fields

    def get_submitter(self, obj):
        return _user_dict_or_none(obj.submitter)

    def get_assigned_to(self, obj):
        return _user_dict_or_none(obj.assigned_to)

    def get_related_reservation(self, obj):
        if obj.related_reservation_id is None:
            return None
        return _RelatedReservationSerializer(obj.related_reservation).data

    def get_related_shop(self, obj):
        if obj.related_shop_id is None:
            return None
        return _RelatedShopSerializer(obj.related_shop).data

    def get_messages(self, obj):
        messages = self.context.get("messages")
        if messages is None:
            messages = obj.messages.all()
        return TicketMessageSerializer(messages, many=True).data

    def get_events(self, obj):
        events = self.context.get("events")
        if events is None:
            # Hide by default — only show when the view explicitly passed
            # an `events` queryset in context (i.e. requester is admin).
            return None
        return TicketEventSerializer(events, many=True).data


class TicketCreateSerializer(serializers.Serializer):
    """Input shape for `POST /tickets/`.

    Ownership of `related_reservation` / `related_shop` is enforced in the
    service layer so there is exactly one place the rule lives.
    """

    category = serializers.ChoiceField(choices=Ticket.Category.choices)
    subject = serializers.CharField(max_length=200, trim_whitespace=True)
    body = serializers.CharField(trim_whitespace=True)
    related_reservation = serializers.PrimaryKeyRelatedField(
        queryset=Reservation.objects.all(),
        required=False,
        allow_null=True,
    )
    related_shop = serializers.PrimaryKeyRelatedField(
        queryset=Shop.objects.all(),
        required=False,
        allow_null=True,
    )

    def validate_subject(self, value: str) -> str:
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Subject is required.")
        return value

    def validate_body(self, value: str) -> str:
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Body is required.")
        return value
