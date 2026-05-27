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
    TimeBlock,
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
    services_count = serializers.SerializerMethodField()
    reviews_count = serializers.SerializerMethodField()
    avg_rating = serializers.SerializerMethodField()
    is_open_now = serializers.SerializerMethodField()

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
            "services_count",
            "reviews_count",
            "avg_rating",
            "is_open_now",
        )

    def get_cover_photo(self, obj) -> str | None:
        photo = obj.photos.order_by("sort_order", "id").first()
        if not photo:
            return None
        url = photo.image.url
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request else url

    def get_services_count(self, obj) -> int:
        # Prefer the queryset annotation (no extra query); fall back to a
        # direct count so this serializer keeps working when reused from
        # contexts that don't annotate (e.g. /favorites/, /nearby/).
        value = getattr(obj, "_services_count", None)
        if value is not None:
            return value
        return obj.services.filter(is_active=True).count()

    def get_reviews_count(self, obj) -> int:
        value = getattr(obj, "_reviews_count", None)
        if value is not None:
            return value
        return obj.reviews.count()

    def get_avg_rating(self, obj) -> float | None:
        value = getattr(obj, "_avg_rating", "__missing__")
        if value == "__missing__":
            from django.db.models import Avg

            value = obj.reviews.aggregate(a=Avg("rating"))["a"]
        return round(float(value), 1) if value is not None else None

    def get_is_open_now(self, obj) -> bool:
        # Imported lazily to avoid a circular import via apps/shops/__init__.
        from .services import is_shop_open_now

        return is_shop_open_now(obj)


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


class TimeBlockSerializer(serializers.ModelSerializer):
    """Owner-managed time block (breaks, maintenance, vacations).

    `resource` and `staff` are both optional FKs. The combinations:
      * `resource` set, `staff` unset  → blocks just that station.
      * both unset                     → blocks the whole shop.
      * `staff` set, `resource` unset  → informational (does NOT remove
        capacity); the booking engine ignores it. We accept it here so the
        owner can still record it on a staff member's profile.
    """

    class Meta:
        model = TimeBlock
        fields = ("id", "shop", "resource", "staff", "start_at", "end_at", "reason")

    def validate(self, attrs):
        start_at = attrs.get("start_at") or getattr(self.instance, "start_at", None)
        end_at = attrs.get("end_at") or getattr(self.instance, "end_at", None)
        if start_at and end_at and end_at <= start_at:
            raise serializers.ValidationError(
                {"end_at": "end_at must be strictly after start_at."}
            )
        resource = attrs.get("resource") if "resource" in attrs else getattr(self.instance, "resource", None)
        shop = attrs.get("shop") if "shop" in attrs else getattr(self.instance, "shop", None)
        if resource is not None and shop is not None and resource.shop_id != shop.id:
            raise serializers.ValidationError(
                {"resource": "Resource does not belong to this shop."}
            )
        staff = attrs.get("staff") if "staff" in attrs else getattr(self.instance, "staff", None)
        if staff is not None and shop is not None and staff.shop_id != shop.id:
            raise serializers.ValidationError(
                {"staff": "Staff does not belong to this shop."}
            )
        return attrs


class FavoriteSerializer(serializers.ModelSerializer):
    """Embeds the shop list payload so the /favorites page can render rich
    cards (name, city, cover, categories) in one request instead of N+1."""

    shop_detail = ShopListSerializer(source="shop", read_only=True)

    class Meta:
        model = Favorite
        fields = ("id", "shop", "shop_detail", "created_at")
        read_only_fields = ("created_at",)
