import re

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
    confirm_email = serializers.EmailField(write_only=True)
    confirm_password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "confirm_email",
            "password",
            "confirm_password",
            "role",
            "first_name",
            "last_name",
            "phone",
        )
        read_only_fields = ("id",)

    def validate_role(self, value):
        if value not in (User.Role.CUSTOMER, User.Role.SHOP_OWNER):
            raise serializers.ValidationError("Role must be 'customer' or 'shop_owner'.")
        return value

    def validate_password(self, value):
        rules = [
            (len(value) >= 8, "at least 8 characters"),
            (re.search(r"[A-Z]", value), "one uppercase letter"),
            (re.search(r"[a-z]", value), "one lowercase letter"),
            (re.search(r"[0-9]", value), "one number"),
            (re.search(r"[^A-Za-z0-9]", value), "one special character"),
        ]
        missing = [msg for ok, msg in rules if not ok]
        if missing:
            raise serializers.ValidationError(
                "Password must contain " + ", ".join(missing) + "."
            )
        return value

    def validate(self, attrs):
        if attrs["email"] != attrs.pop("confirm_email"):
            raise serializers.ValidationError({"confirm_email": "Email addresses do not match."})
        if attrs["password"] != attrs.pop("confirm_password"):
            raise serializers.ValidationError(
                {"confirm_password": "Passwords do not match."}
            )
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        # Login is by email (USERNAME_FIELD = "email"); username is a legacy
        # AbstractUser column that must stay unique and non-blank, so mirror
        # the email into it rather than collecting it at sign-up.
        user = User(username=validated_data["email"], **validated_data)
        user.set_password(password)
        user.save()
        return user
