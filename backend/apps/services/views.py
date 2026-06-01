from datetime import datetime

from django.db import transaction
from django.db.models import Avg, Count
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.accounts.permissions import IsShopOwner
from apps.shops.models import Category, Shop

from .models import Service, ServicePhoto, ServicePriceHistory
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
    """`/api/services/categories/` now returns the unified taxonomy from
    `apps.shops.Category` — same rows as `/api/shops/categories/`."""

    queryset = Category.objects.all()
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

    # Maps the public `?ordering=` value (sent verbatim by the frontend) to the
    # column we actually order by. Rating + reviews-count map to the annotation
    # aliases added in `discover()`. Anything not in this dict falls back to the
    # default ("name") so a typo can never 500 the public catalog.
    _DISCOVER_ORDERING_MAP = {
        "name": "name",
        "-name": "-name",
        "shop_avg_rating": "_shop_avg_rating",
        "-shop_avg_rating": "-_shop_avg_rating",
        "shop_reviews_count": "_shop_reviews_count",
        "-shop_reviews_count": "-_shop_reviews_count",
        "created_at": "created_at",
        "-created_at": "-created_at",
    }
    _DISCOVER_DEFAULT_ORDERING = "name"

    @action(detail=False, methods=["get"], url_path="discover")
    def discover(self, request):
        """Cross-shop service search for customers.

        Returns services with shop name + city embedded so the result list can link
        directly to the booking flow without a second round-trip per row. Paginated
        via the same `ServicePagination` used by the list action.

        Each row also exposes `shop_avg_rating` (rounded to 1 decimal, `null` if
        the shop has zero reviews) and `shop_reviews_count` so the browse-page
        cards can render a rating pill. There's no service-level review model;
        the redesign reuses the shop's aggregate as a proxy for the service.

        Sort with `?ordering=` (see `_DISCOVER_ORDERING_MAP` for accepted values).
        Postgres places NULLs last on a DESC sort, so `-shop_avg_rating` puts
        shops with no reviews at the end — which is what we want for "Highest
        rated".
        """
        q = request.query_params.get("q", "").strip()
        category_ids = self._parse_category_ids(request)
        city = request.query_params.get("city")
        ordering_param = request.query_params.get("ordering", "").strip()
        booking_date = self._parse_booking_date(request)
        guests = self._parse_guests(request)
        min_rating = self._parse_min_rating(request)

        # Filter -> annotate -> order_by. The annotations must be applied AFTER
        # the filters so an unrelated `shop__reviews` join in the filter clause
        # can't inflate the Avg/Count.
        qs = (
            Service.objects.select_related("shop", "category")
            .prefetch_related("gallery")
            .filter(is_active=True, shop__status=Shop.Status.ACTIVE)
        )
        if q:
            qs = qs.filter(name__icontains=q)
        if category_ids:
            qs = qs.filter(category_id__in=category_ids)
        if city:
            qs = qs.filter(shop__city__iexact=city)
        if guests > 1:
            # Cheap SQL pre-filter so the Python availability scan below has
            # less to chew on. The scan still re-checks per-service.
            qs = qs.filter(max_quantity__gte=guests)
        if booking_date is not None:
            qs = self._filter_by_availability(qs, booking_date, guests)

        qs = qs.annotate(
            _shop_avg_rating=Avg("shop__reviews__rating"),
            _shop_reviews_count=Count("shop__reviews", distinct=True),
        )

        if min_rating is not None:
            # Applied AFTER the annotation so the Avg is already attached.
            # Services on shops with zero reviews (_shop_avg_rating IS NULL)
            # fail the comparison, which is the intent — "4+ stars" should
            # exclude unrated shops.
            qs = qs.filter(_shop_avg_rating__gte=min_rating)

        ordering_field = self._DISCOVER_ORDERING_MAP.get(
            ordering_param, self._DISCOVER_DEFAULT_ORDERING
        )
        # `id` is the deterministic tie-breaker so pagination is stable when
        # the primary sort key has ties (e.g. lots of name=null or same rating).
        qs = qs.order_by(ordering_field, "id")

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
                "shop_avg_rating": (
                    round(service._shop_avg_rating, 1)
                    if service._shop_avg_rating is not None
                    else None
                ),
                "shop_reviews_count": service._shop_reviews_count or 0,
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

    @staticmethod
    def _parse_booking_date(request):
        """Parse `?booking_date=YYYY-MM-DD`. Returns None on missing/malformed,
        matching the shops endpoint's contract (bad filter params don't 400)."""
        raw = request.query_params.get("booking_date")
        if not raw:
            return None
        try:
            return datetime.strptime(raw, "%Y-%m-%d").date()
        except ValueError:
            return None

    @staticmethod
    def _parse_guests(request) -> int:
        """Parse `?guests=N`. Defaults to 1; clamps to [1, 50] so a hostile
        caller can't ask us to scan availability for guests=999999."""
        raw = request.query_params.get("guests")
        if not raw:
            return 1
        try:
            value = int(raw)
        except ValueError:
            return 1
        return max(1, min(value, 50))

    @staticmethod
    def _parse_category_ids(request):
        """Parse `?category=1,2,3` (comma-separated) or repeated `?category=1`.

        Returns a list of positive ints. Single-id requests stay
        backwards-compatible with the old `?category=<id>` form."""
        raw = request.query_params.getlist("category")
        # The browse page sends a single comma-joined string; the bookmark/test
        # form may repeat the param. Handle both by splitting every value.
        tokens: list[str] = []
        for value in raw:
            tokens.extend(value.split(","))
        ids: list[int] = []
        for tok in tokens:
            tok = tok.strip()
            if not tok:
                continue
            try:
                n = int(tok)
            except ValueError:
                continue
            if n > 0:
                ids.append(n)
        return ids

    @staticmethod
    def _parse_min_rating(request):
        """Parse `?min_rating=4.5`. Returns None on missing/malformed/<=0 so
        bad input is silently ignored — same forgiving contract as the rest
        of the discover filters."""
        raw = request.query_params.get("min_rating")
        if not raw:
            return None
        try:
            value = float(raw)
        except ValueError:
            return None
        if value <= 0:
            return None
        return value

    @staticmethod
    def _filter_by_availability(queryset, target_date, guests):
        """Restrict `queryset` to services with at least one free slot on
        `target_date` for `guests` people. Walks each row through
        `service_has_free_slot_on_date` — expensive, so we lean on the cheap
        SQL filters above to shrink the input set first."""
        if target_date < timezone.localdate():
            return queryset.none()

        from apps.shops.services import service_has_free_slot_on_date

        candidates = queryset.prefetch_related("shop__resources")
        matching_ids = [
            s.id
            for s in candidates
            if service_has_free_slot_on_date(s, target_date, quantity=guests)
        ]
        return queryset.filter(id__in=matching_ids)
