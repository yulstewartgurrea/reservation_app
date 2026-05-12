from django.contrib.auth import get_user_model
from rest_framework import serializers

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "username",
            "role",
            "first_name",
            "last_name",
            "phone",
            "avatar",
            "no_show_count_90d",
            "cancellation_strikes_90d",
            "restricted_until",
            "email_verified_at",
        )
        read_only_fields = (
            "id",
            "no_show_count_90d",
            "cancellation_strikes_90d",
            "restricted_until",
            "email_verified_at",
        )


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ("id", "email", "username", "password", "role", "first_name", "last_name", "phone")
        read_only_fields = ("id",)

    def validate_role(self, value):
        if value not in (User.Role.CUSTOMER, User.Role.SHOP_OWNER):
            raise serializers.ValidationError("Role must be 'customer' or 'shop_owner'.")
        return value

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user
