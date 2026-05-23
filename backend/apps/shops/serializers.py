from rest_framework import serializers

from .models import (
    Favorite,
    HoursOverride,
    Resource,
    Shop,
    ShopCategory,
    ShopPhoto,
    Staff,
    StaffWorkingHours,
    WeekdayHours,
)


class ResourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Resource
        fields = ("id", "shop", "name", "is_active", "created_at")
        read_only_fields = ("created_at",)


class ShopCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ShopCategory
        fields = ("id", "name", "slug")


class ShopPhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShopPhoto
        fields = ("id", "image", "caption", "sort_order")


class WeekdayHoursSerializer(serializers.ModelSerializer):
    class Meta:
        model = WeekdayHours
        fields = ("id", "weekday", "is_closed", "open_time", "close_time")


class HoursOverrideSerializer(serializers.ModelSerializer):
    class Meta:
        model = HoursOverride
        fields = ("id", "date", "is_closed", "open_time", "close_time", "note")


class StaffSerializer(serializers.ModelSerializer):
    class Meta:
        model = Staff
        fields = ("id", "shop", "name", "role", "photo", "phone", "email", "is_active")


class StaffWorkingHoursSerializer(serializers.ModelSerializer):
    class Meta:
        model = StaffWorkingHours
        fields = ("id", "weekday", "is_off", "start_time", "end_time")


class ShopListSerializer(serializers.ModelSerializer):
    categories = ShopCategorySerializer(many=True, read_only=True)
    cover_photo = serializers.SerializerMethodField()

    class Meta:
        model = Shop
        fields = (
            "id",
            "name",
            "city",
            "country",
            "status",
            "categories",
            "latitude",
            "longitude",
            "cover_photo",
        )

    def get_cover_photo(self, obj) -> str | None:
        photo = obj.photos.order_by("sort_order", "id").first()
        if not photo:
            return None
        url = photo.image.url
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request else url


class ShopDetailSerializer(serializers.ModelSerializer):
    categories = ShopCategorySerializer(many=True, read_only=True)
    photos = ShopPhotoSerializer(many=True, read_only=True)
    cover_photo = serializers.SerializerMethodField()
    weekday_hours = WeekdayHoursSerializer(many=True, read_only=True)
    resources = serializers.SerializerMethodField()
    services_count = serializers.SerializerMethodField()
    reviews_count = serializers.SerializerMethodField()
    total_bookings = serializers.SerializerMethodField()

    class Meta:
        model = Shop
        fields = (
            "id",
            "owner",
            "name",
            "description",
            "categories",
            "address_line",
            "address_line_2",
            "city",
            "state_province",
            "barangay",
            "province_code",
            "city_code",
            "barangay_code",
            "postal_code",
            "country",
            "landmark",
            "latitude",
            "longitude",
            "phone",
            "email",
            "status",
            "resource_label",
            "commission_rate",
            "cancellation_window_hours",
            "photos",
            "cover_photo",
            "weekday_hours",
            "resources",
            "services_count",
            "reviews_count",
            "total_bookings",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("owner", "status", "commission_rate", "created_at", "updated_at")

    def get_resources(self, obj) -> list:
        return ResourceSerializer(
            obj.resources.filter(is_active=True).order_by("id"), many=True
        ).data

    def get_cover_photo(self, obj) -> str | None:
        """First photo by sort_order — same convention as `ShopListSerializer`."""
        photo = obj.photos.order_by("sort_order", "id").first()
        if not photo:
            return None
        url = photo.image.url
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request else url

    def get_services_count(self, obj) -> int:
        return obj.services.filter(is_active=True).count()

    def get_reviews_count(self, obj) -> int:
        return obj.reviews.count()

    def get_total_bookings(self, obj) -> int | None:
        """Owner-only metric. Returns None for non-owners so the field is hidden."""
        request = self.context.get("request")
        user = getattr(request, "user", None) if request else None
        if not user or not user.is_authenticated or user.id != obj.owner_id:
            return None
        return obj.reservations.count()


class ShopWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Shop
        fields = (
            "name",
            "description",
            "address_line",
            "address_line_2",
            "city",
            "state_province",
            "barangay",
            "province_code",
            "city_code",
            "barangay_code",
            "postal_code",
            "country",
            "landmark",
            "latitude",
            "longitude",
            "phone",
            "email",
            "resource_label",
            "cancellation_window_hours",
        )


class FavoriteSerializer(serializers.ModelSerializer):
    """Embeds the shop list payload so the /favorites page can render rich
    cards (name, city, cover, categories) in one request instead of N+1."""

    shop_detail = ShopListSerializer(source="shop", read_only=True)

    class Meta:
        model = Favorite
        fields = ("id", "shop", "shop_detail", "created_at")
        read_only_fields = ("created_at",)
