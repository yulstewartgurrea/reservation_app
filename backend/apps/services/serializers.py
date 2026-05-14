from rest_framework import serializers

from .models import Service, ServiceCategory, ServicePhoto


class ServiceCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceCategory
        fields = ("id", "name", "slug")


class ServicePhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServicePhoto
        fields = ("id", "image", "caption", "sort_order", "is_primary")
        read_only_fields = ("is_primary",)


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
