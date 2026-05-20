from django.db import transaction
from django.db.models import Avg
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.accounts.permissions import IsShopOwner
from apps.shops.models import Shop

from .models import Service, ServiceCategory, ServicePhoto, ServicePriceHistory
from .serializers import (
    ServiceCategorySerializer,
    ServicePhotoSerializer,
    ServicePriceHistorySerializer,
    ServiceSerializer,
)
from .services import update_service


class ServicePagination(PageNumberPagination):
    """Paginator for the public services list.

    Lets the frontend ask for grid-friendly page sizes (e.g. 8 cards on the
    shop detail page) without exposing a way to slurp the whole table.
    """

    page_size = 12
    page_size_query_param = "page_size"
    max_page_size = 50


class ServiceCategoryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ServiceCategory.objects.all()
    serializer_class = ServiceCategorySerializer
    permission_classes = [permissions.AllowAny]


class ServiceViewSet(viewsets.ModelViewSet):
    serializer_class = ServiceSerializer
    pagination_class = ServicePagination
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    filterset_fields = ["shop", "category", "is_active"]
    search_fields = ["name", "description"]
    ordering_fields = ["name", "price", "duration_minutes", "created_at"]
    ordering = ["name"]

    def get_permissions(self):
        if self.action in ("list", "retrieve", "discover"):
            return [permissions.AllowAny()]
        # `photos` is GET-or-POST: GET is public so customers can see the gallery;
        # POST is enforced as owner-only inside the handler.
        if self.action == "photos" and self.request.method == "GET":
            return [permissions.AllowAny()]
        # price-history is owner-OR-admin; the owner-vs-admin scoping (own
        # services only for owners, any for admin) is enforced inside the
        # handler via `_can_view_price_history`, so just require auth here.
        if self.action == "price_history":
            return [permissions.IsAuthenticated()]
        return [IsShopOwner()]

    def get_queryset(self):
        """Scope service rows to the calling role.

        - Owner viewing their own shop (`?shop=<id>` where they own that shop):
          return all services including inactive ones, so the owner dashboard
          can show and manage them.
        - Anyone else hitting `list`: only active services (public catalog).
        - Mutating actions: restricted to services on shops the caller owns.
        """
        qs = Service.objects.select_related("shop", "category")
        if self.action in ("update", "partial_update", "destroy"):
            return qs.filter(shop__owner=self.request.user)
        if self.action == "list":
            shop_id = self.request.query_params.get("shop")
            user = self.request.user
            if (
                shop_id
                and user.is_authenticated
                and Shop.objects.filter(pk=shop_id, owner=user).exists()
            ):
                return qs.filter(shop_id=shop_id)
            qs = qs.filter(is_active=True)
        return qs

    def perform_create(self, serializer):
        shop = serializer.validated_data["shop"]
        if shop.owner_id != self.request.user.id:
            raise PermissionDenied("You can only add services to your own shop.")
        serializer.save()

    def perform_update(self, serializer):
        """Route updates through the service layer so a price change is
        recorded in ServicePriceHistory atomically (no inline save, no signal).
        """
        update_service(
            service=serializer.instance,
            validated_data=serializer.validated_data,
            changed_by=self.request.user,
        )

    @action(detail=True, methods=["get"], url_path="price-history")
    def price_history(self, request, pk=None):
        """Read-only price-change audit trail for one service.

        Owner may view their OWN services' history; admin may view any.
        The owner-vs-admin scoping is enforced by `_can_view_price_history`.
        """
        service = self.get_object()
        if not self._can_view_price_history(request.user, service):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        qs = service.price_history.select_related("changed_by").all()
        return Response(ServicePriceHistorySerializer(qs, many=True).data)

    @staticmethod
    def _can_view_price_history(user, service) -> bool:
        if not (user and user.is_authenticated):
            return False
        if user.role == "admin" or user.is_superuser:
            return True
        return service.shop.owner_id == user.id

    @action(
        detail=True,
        methods=["get", "post"],
        url_path="photos",
        parser_classes=[MultiPartParser, FormParser, JSONParser],
    )
    def photos(self, request, pk=None):
        """List a service's gallery, or upload a new photo (owner-only).

        The first photo uploaded to a service is auto-marked as primary so the
        service always has a cover image once it has any photo at all.
        """
        service = self.get_object()
        if request.method == "GET":
            qs = service.gallery.all()
            return Response(ServicePhotoSerializer(qs, many=True).data)

        if service.shop.owner_id != request.user.id:
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        image = request.FILES.get("image")
        if image is None:
            return Response({"detail": "image file is required."}, status=400)
        is_first_photo = not service.gallery.exists()
        photo = ServicePhoto.objects.create(
            service=service,
            image=image,
            caption=request.data.get("caption", ""),
            sort_order=int(request.data.get("sort_order", 0) or 0),
            is_primary=is_first_photo,
        )
        return Response(ServicePhotoSerializer(photo).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["delete"], url_path=r"photos/(?P<photo_id>\d+)")
    def delete_photo(self, request, pk=None, photo_id=None):
        service = self.get_object()
        if service.shop.owner_id != request.user.id:
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        with transaction.atomic():
            photo = ServicePhoto.objects.filter(service=service, id=photo_id).first()
            if photo is None:
                return Response(status=status.HTTP_204_NO_CONTENT)
            was_primary = photo.is_primary
            photo.delete()
            # Promote the next photo so the service keeps a cover image.
            if was_primary:
                fallback = (
                    ServicePhoto.objects.filter(service=service)
                    .order_by("sort_order", "id")
                    .first()
                )
                if fallback is not None:
                    fallback.is_primary = True
                    fallback.save(update_fields=["is_primary"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(
        detail=True,
        methods=["post"],
        url_path=r"photos/(?P<photo_id>\d+)/primary",
    )
    def set_primary_photo(self, request, pk=None, photo_id=None):
        """Mark one photo as the service's primary (cover) image."""
        service = self.get_object()
        if service.shop.owner_id != request.user.id:
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        photo = ServicePhoto.objects.filter(service=service, id=photo_id).first()
        if photo is None:
            return Response({"detail": "Photo not found."}, status=status.HTTP_404_NOT_FOUND)

        # Clear the existing primary first so the partial unique constraint
        # doesn't fire mid-transaction.
        with transaction.atomic():
            ServicePhoto.objects.filter(service=service, is_primary=True).exclude(
                id=photo.id
            ).update(is_primary=False)
            if not photo.is_primary:
                photo.is_primary = True
                photo.save(update_fields=["is_primary"])
        return Response(ServicePhotoSerializer(photo).data)

    @action(detail=False, methods=["get"], url_path="stats", permission_classes=[IsShopOwner])
    def stats(self, request):
        """Aggregate service counts for an owner-managed shop.

        Used by the shop dashboard KPI strip. Aggregates run against the whole
        services table (not just the current page) so the numbers stay stable
        regardless of pagination. Requires `?shop=<id>` and shop ownership.
        """
        shop_id = request.query_params.get("shop")
        if not shop_id:
            return Response({"detail": "shop is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not Shop.objects.filter(pk=shop_id, owner=request.user).exists():
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        qs = Service.objects.filter(shop_id=shop_id)
        total = qs.count()
        active = qs.filter(is_active=True).count()
        avg = qs.aggregate(v=Avg("duration_minutes"))["v"] or 0
        return Response({
            "total": total,
            "active": active,
            "inactive": total - active,
            "avg_duration": round(avg),
        })

    @action(detail=False, methods=["get"], url_path="discover")
    def discover(self, request):
        """Cross-shop service search for customers.

        Returns services with shop name + city embedded so the result list can link
        directly to the booking flow without a second round-trip per row. Paginated
        via the same `ServicePagination` used by the list action.
        """
        q = request.query_params.get("q", "").strip()
        category = request.query_params.get("category")
        city = request.query_params.get("city")

        qs = (
            Service.objects.select_related("shop", "category")
            .prefetch_related("gallery")
            .filter(is_active=True, shop__status=Shop.Status.ACTIVE)
            .order_by("name", "id")
        )
        if q:
            qs = qs.filter(name__icontains=q)
        if category:
            qs = qs.filter(category_id=category)
        if city:
            qs = qs.filter(shop__city__iexact=city)

        def serialize(service):
            return {
                "id": service.id,
                "name": service.name,
                "duration_minutes": service.duration_minutes,
                "price": str(service.price),
                "cover_photo": self._cover_url(service, request),
                "shop_id": service.shop_id,
                "shop_name": service.shop.name,
                "shop_city": service.shop.city,
                "category": service.category.name if service.category else None,
            }

        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response([serialize(s) for s in page])
        return Response([serialize(s) for s in qs])

    @staticmethod
    def _cover_url(service, request):
        """Same logic as `ServiceSerializer.get_cover_photo` —
        primary photo, falling back to the first by sort_order."""
        photos = list(service.gallery.all())
        if not photos:
            return None
        primary = next((p for p in photos if p.is_primary), photos[0])
        url = primary.image.url
        return request.build_absolute_uri(url) if request else url
