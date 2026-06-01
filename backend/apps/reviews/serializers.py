from rest_framework import serializers

from apps.reservations.models import Reservation

from .models import Review


class ReviewSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()

    def get_customer_name(self, obj) -> str:
        # username now mirrors the email, so never expose it publicly here.
        full_name = f"{obj.customer.first_name} {obj.customer.last_name}".strip()
        return full_name or "Customer"

    class Meta:
        model = Review
        fields = (
            "id",
            "customer",
            "customer_name",
            "shop",
            "reservation",
            "rating",
            "comment",
            "shop_reply",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("customer", "shop", "shop_reply", "created_at", "updated_at")

    def validate_reservation(self, value: Reservation):
        request = self.context["request"]
        if value.customer_id != request.user.id:
            raise serializers.ValidationError("You did not make this reservation.")
        if value.status != Reservation.Status.COMPLETED:
            raise serializers.ValidationError("You can only review completed reservations.")
        return value

    def create(self, validated_data):
        reservation = validated_data["reservation"]
        validated_data["customer"] = self.context["request"].user
        validated_data["shop"] = reservation.shop
        return super().create(validated_data)


class ShopReplySerializer(serializers.Serializer):
    shop_reply = serializers.CharField()
