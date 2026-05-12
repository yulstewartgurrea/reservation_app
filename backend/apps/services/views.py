from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.accounts.permissions import IsShopOwner
from apps.shops.models import Shop

from .models import Service, ServiceCategory, ServicePhoto
from .serializers import (
    ServiceCategorySerializer,
    ServicePhotoSerializer,
    ServiceSerializer,
)


class ServiceCategoryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ServiceCategory.objects.all()
    serializer_class = ServiceCategorySerializer
    permission_classes = [permissions.AllowAny]


class ServiceViewSet(viewsets.ModelViewSet):
    serializer_class = ServiceSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    filterset_fields = ["shop", "category", "is_active"]
    search_fields = ["name", "description"]

    def get_permissions(self):
        if self.action in ("list", "retrieve", "discover"):
            return [permissions.AllowAny()]
        # `photos` is GET-or-POST: GET is public so customers can see the gallery;
        # POST is enforced as owner-only inside the handler.
        if self.action == "photos" and self.request.method == "GET":
            return [permissions.AllowAny()]
        return [IsShopOwner()]

    def get_queryset(self):
        qs = Service.objects.select_related("shop", "category")
        if self.action in ("update", "partial_update", "destroy"):
            qs = qs.filter(shop__owner=self.request.user)
        elif self.action == "list":
            qs = qs.filter(is_active=True)
        return qs

    def perform_create(self, serializer):
        shop = serializer.validated_data["shop"]
        if shop.owner_id != self.request.user.id:
            raise PermissionDenied("You can only add services to your own shop.")
        serializer.save()

    @action(
        detail=True,
        methods=["get", "post"],
        url_path="photos",
        parser_classes=[MultiPartParser, FormParser, JSONParser],
    )
    def photos(self, request, pk=None):
        """List a service's gallery, or upload a new photo (owner-only)."""
        service = self.get_object()
        if request.method == "GET":
            qs = service.gallery.all()
            return Response(ServicePhotoSerializer(qs, many=True).data)

        if service.shop.owner_id != request.user.id:
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        image = request.FILES.get("image")
        if image is None:
            return Response({"detail": "image file is required."}, status=400)
        photo = ServicePhoto.objects.create(
            service=service,
            image=image,
            caption=request.data.get("caption", ""),
            sort_order=int(request.data.get("sort_order", 0) or 0),
        )
        return Response(ServicePhotoSerializer(photo).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["delete"], url_path=r"photos/(?P<photo_id>\d+)")
    def delete_photo(self, request, pk=None, photo_id=None):
        service = self.get_object()
        if service.shop.owner_id != request.user.id:
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        ServicePhoto.objects.filter(service=service, id=photo_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["get"], url_path="discover")
    def discover(self, request):
        """Cross-shop service search for customers.

        Returns services with shop name + city embedded so the result list can link
        directly to the booking flow without a second round-trip per row.
        """
        q = request.query_params.get("q", "").strip()
        category = request.query_params.get("category")
        city = request.query_params.get("city")

        qs = (
            Service.objects.select_related("shop", "category")
            .prefetch_related("gallery")
            .filter(is_active=True, shop__status=Shop.Status.ACTIVE)
        )
        if q:
            qs = qs.filter(name__icontains=q)
        if category:
            qs = qs.filter(category_id=category)
        if city:
            qs = qs.filter(shop__city__iexact=city)

        results = []
        for s in qs[:50]:
            cover = self._cover_url(s, request)
            results.append(
                {
                    "id": s.id,
                    "name": s.name,
                    "duration_minutes": s.duration_minutes,
                    "price": str(s.price),
                    "cover_photo": cover,
                    "shop_id": s.shop_id,
                    "shop_name": s.shop.name,
                    "shop_city": s.shop.city,
                    "category": s.category.name if s.category else None,
                }
            )
        return Response(results)

    @staticmethod
    def _cover_url(service, request):
        """Same fallback logic as `ServiceSerializer.get_cover_photo` —
        first gallery photo, else the legacy single `Service.photo` field."""
        first = next(iter(service.gallery.all()), None)
        if first:
            url = first.image.url
        elif service.photo:
            url = service.photo.url
        else:
            return None
        return request.build_absolute_uri(url) if request else url
