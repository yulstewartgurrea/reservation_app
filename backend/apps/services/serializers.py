from rest_framework import serializers

from .models import Service, ServiceCategory, ServicePhoto


class ServiceCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceCategory
        fields = ("id", "name", "slug")


class ServicePhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServicePhoto
        fields = ("id", "image", "caption", "sort_order")


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
            "photo",
            "cover_photo",
            "gallery",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at", "cover_photo", "gallery")

    def get_cover_photo(self, obj) -> str | None:
        """First gallery photo if any, else the legacy single `photo` field."""
        request = self.context.get("request")
        first = obj.gallery.first()
        if first:
            return request.build_absolute_uri(first.image.url) if request else first.image.url
        if obj.photo:
            return request.build_absolute_uri(obj.photo.url) if request else obj.photo.url
        return None
