from rest_framework import serializers

from apps.shops.serializers import CategorySerializer

from .models import Service, ServicePhoto, ServicePriceHistory


# Backwards-compatible alias — existing imports / serializer field nesting
# (`category_detail`) keep working after the model unification.
ServiceCategorySerializer = CategorySerializer


class ServicePhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServicePhoto
        fields = ("id", "image", "caption", "sort_order", "is_primary")
        read_only_fields = ("is_primary",)


class ServicePriceHistorySerializer(serializers.ModelSerializer):
    changed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ServicePriceHistory
        fields = (
            "id",
            "service",
            "old_price",
            "new_price",
            "changed_by",
            "changed_by_name",
            "created_at",
        )
        read_only_fields = fields

    def get_changed_by_name(self, obj) -> str | None:
        if not obj.changed_by_id:
            return None
        u = obj.changed_by
        return f"{u.first_name} {u.last_name}".strip() or u.username or u.email


class ServiceSerializer(serializers.ModelSerializer):
    category_detail = ServiceCategorySerializer(source="category", read_only=True)
    gallery = ServicePhotoSerializer(many=True, read_only=True)
    cover_photo = serializers.SerializerMethodField()

    class Meta:
        model = Service
        fields = (
            "id",
            "shop",
            "category",
            "category_detail",
            "name",
            "description",
            "duration_minutes",
            "buffer_minutes",
            "price",
            "max_quantity",
            "unit_label",
            "inter_unit_buffer_minutes",
            "cover_photo",
            "gallery",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at", "cover_photo", "gallery")

    def get_cover_photo(self, obj) -> str | None:
        """The primary gallery photo, falling back to the first by sort_order
        if no row is marked primary (only happens if backfill missed a service)."""
        request = self.context.get("request")
        photos = list(obj.gallery.all())
        if not photos:
            return None
        primary = next((p for p in photos if p.is_primary), photos[0])
        return request.build_absolute_uri(primary.image.url) if request else primary.image.url
