from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import MaintenanceReminder, Notification

User = get_user_model()


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ("id", "kind", "title", "body", "payload", "read_at", "created_at")
        read_only_fields = fields


class MaintenanceReminderSerializer(serializers.ModelSerializer):
    customer_email = serializers.EmailField(write_only=True)
    customer_display = serializers.SerializerMethodField(read_only=True)
    shop_name = serializers.CharField(source="shop.name", read_only=True)

    class Meta:
        model = MaintenanceReminder
        fields = (
            "id",
            "shop",
            "shop_name",
            "customer",
            "customer_email",
            "customer_display",
            "service",
            "title",
            "message",
            "interval_months",
            "next_due_at",
            "last_sent_at",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "customer",
            "shop_name",
            "customer_display",
            "last_sent_at",
            "created_at",
            "updated_at",
        )

    def get_customer_display(self, obj) -> str:
        c = obj.customer
        name = (c.first_name or "").strip()
        return f"{name} <{c.email}>" if name else c.email

    def validate_interval_months(self, value: int) -> int:
        if value < 1 or value > 60:
            raise serializers.ValidationError("interval_months must be between 1 and 60.")
        return value

    def validate(self, attrs):
        email = attrs.pop("customer_email", None)
        if email:
            try:
                attrs["customer"] = User.objects.get(email__iexact=email.strip())
            except User.DoesNotExist:
                raise serializers.ValidationError(
                    {"customer_email": "No registered user with that email."}
                )
        elif self.instance is None:
            raise serializers.ValidationError({"customer_email": "This field is required."})

        shop = attrs.get("shop") or (self.instance and self.instance.shop)
        request = self.context.get("request")
        if shop and request and shop.owner_id != request.user.id:
            raise serializers.ValidationError({"shop": "You can only manage your own shop's reminders."})

        service = attrs.get("service") or (self.instance and self.instance.service)
        if service and shop and service.shop_id != shop.id:
            raise serializers.ValidationError({"service": "Service must belong to the selected shop."})

        return attrs
