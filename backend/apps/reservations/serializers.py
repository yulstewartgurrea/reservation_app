from datetime import timedelta

from django.conf import settings
from rest_framework import serializers

from apps.services.models import Service
from apps.shops.models import Resource, Shop, Staff

from .models import CommissionInvoice, Reservation


class ReservationListSerializer(serializers.ModelSerializer):
    shop_name = serializers.CharField(source="shop.name", read_only=True)
    service_name = serializers.CharField(source="service.name", read_only=True)
    service_duration_minutes = serializers.IntegerField(
        source="service.duration_minutes", read_only=True
    )
    staff_name = serializers.SerializerMethodField()
    resource_name = serializers.CharField(source="resource.name", read_only=True, default=None)
    payment_status = serializers.SerializerMethodField()
    customer_name = serializers.SerializerMethodField()
    customer_email = serializers.SerializerMethodField()
    customer_phone = serializers.SerializerMethodField()
    reference = serializers.SerializerMethodField()

    class Meta:
        model = Reservation
        fields = (
            "id",
            "reference",
            "shop",
            "shop_name",
            "service",
            "service_name",
            "service_duration_minutes",
            "staff",
            "staff_name",
            "resource",
            "resource_name",
            "start_at",
            "end_at",
            "status",
            "source",
            "quantity",
            "unit_price",
            "total_price",
            "payment_method",
            "payment_status",
            "customer_name",
            "customer_email",
            "customer_phone",
            "customer_notes",
        )

    def get_payment_status(self, obj) -> str | None:
        payment = getattr(obj, "payment", None)
        return payment.status if payment else None

    def get_reference(self, obj) -> str:
        return f"RSV-{obj.id:06d}"

    def get_staff_name(self, obj) -> str | None:
        return obj.staff.name if obj.staff_id else None

    def get_customer_name(self, obj) -> str:
        if obj.customer_id:
            customer = obj.customer
            full_name = f"{customer.first_name} {customer.last_name}".strip()
            return full_name or customer.username or customer.email.split("@")[0]
        return obj.guest_name or "Guest"

    def get_customer_email(self, obj) -> str:
        return obj.customer.email if obj.customer_id else ""

    def get_customer_phone(self, obj) -> str:
        if obj.customer_id:
            return obj.customer.phone or ""
        return obj.guest_phone or ""


class ReservationDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reservation
        fields = "__all__"
        read_only_fields = (
            "customer",
            "resource",
            "end_at",
            "quantity",
            "unit_price",
            "total_price",
            "commission_amount",
            "status",
            "source",
            "created_by_shop",
            "created_at",
            "updated_at",
        )


class CustomerBookingSerializer(serializers.Serializer):
    """Customer-facing booking input."""

    shop = serializers.PrimaryKeyRelatedField(queryset=Shop.objects.all())
    service = serializers.PrimaryKeyRelatedField(queryset=Service.objects.all())
    staff = serializers.PrimaryKeyRelatedField(
        queryset=Staff.objects.all(), required=False, allow_null=True
    )
    start_at = serializers.DateTimeField()
    quantity = serializers.IntegerField(required=False, min_value=1, default=1)
    customer_notes = serializers.CharField(required=False, allow_blank=True, default="")
    payment_method = serializers.ChoiceField(
        choices=("pay_on_arrival", "online"),
        default="pay_on_arrival",
    )

    def validate(self, attrs):
        if attrs["service"].shop_id != attrs["shop"].id:
            raise serializers.ValidationError("Service does not belong to this shop.")
        if attrs.get("staff") and attrs["staff"].shop_id != attrs["shop"].id:
            raise serializers.ValidationError("Staff does not belong to this shop.")
        return attrs


class WalkInSerializer(serializers.Serializer):
    """Shop-owner-created walk-in booking."""

    shop = serializers.PrimaryKeyRelatedField(queryset=Shop.objects.all())
    service = serializers.PrimaryKeyRelatedField(queryset=Service.objects.all())
    staff = serializers.PrimaryKeyRelatedField(
        queryset=Staff.objects.all(), required=False, allow_null=True
    )
    resource = serializers.PrimaryKeyRelatedField(
        queryset=Resource.objects.all(), required=False, allow_null=True
    )
    start_at = serializers.DateTimeField()
    quantity = serializers.IntegerField(required=False, min_value=1, default=1)
    customer_id = serializers.IntegerField(required=False, allow_null=True)
    guest_name = serializers.CharField(required=False, allow_blank=True, default="")
    guest_phone = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        if attrs["service"].shop_id != attrs["shop"].id:
            raise serializers.ValidationError("Service does not belong to this shop.")
        if attrs.get("staff") and attrs["staff"].shop_id != attrs["shop"].id:
            raise serializers.ValidationError("Staff does not belong to this shop.")
        if attrs.get("resource") and attrs["resource"].shop_id != attrs["shop"].id:
            raise serializers.ValidationError("Resource does not belong to this shop.")
        if not attrs.get("customer_id") and not attrs.get("guest_name"):
            raise serializers.ValidationError("Provide either customer_id or guest_name.")
        return attrs


class CommissionInvoiceSerializer(serializers.ModelSerializer):
    shop_name = serializers.CharField(source="shop.name", read_only=True)
    is_overdue = serializers.SerializerMethodField()

    class Meta:
        model = CommissionInvoice
        fields = [
            "id",
            "shop",
            "shop_name",
            "period",
            "amount",
            "status",
            "issued_at",
            "due_date",
            "paid_at",
            "settled_offline",
            "payment_url",
            "is_overdue",
            "created_at",
        ]
        read_only_fields = fields

    def get_is_overdue(self, obj) -> bool:
        from django.utils import timezone

        return (
            obj.status == CommissionInvoice.Status.OPEN
            and obj.due_date < timezone.now().date()
        )


class AvailabilityRequestSerializer(serializers.Serializer):
    shop = serializers.PrimaryKeyRelatedField(queryset=Shop.objects.all())
    service = serializers.PrimaryKeyRelatedField(queryset=Service.objects.all())
    staff = serializers.PrimaryKeyRelatedField(
        queryset=Staff.objects.all(), required=False, allow_null=True
    )
    date = serializers.DateField()
    quantity = serializers.IntegerField(required=False, min_value=1, default=1)

    def validate(self, attrs):
        service = attrs["service"]
        quantity = attrs.get("quantity", 1)
        if quantity > service.max_quantity:
            raise serializers.ValidationError(
                f"Quantity exceeds the maximum of {service.max_quantity} "
                "for this service."
            )
        return attrs
