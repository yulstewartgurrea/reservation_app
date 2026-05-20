import math

from django.db import transaction
from django.db.models import Q
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from apps.accounts.permissions import IsCustomer, IsShopOwner

from .geocoding import geocode_address
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
from .serializers import (
    FavoriteSerializer,
    HoursOverrideSerializer,
    ResourceSerializer,
    ShopCategorySerializer,
    ShopDetailSerializer,
    ShopListSerializer,
    ShopPhotoSerializer,
    ShopWriteSerializer,
    StaffSerializer,
    StaffWorkingHoursSerializer,
    WeekdayHoursSerializer,
)


def _bounding_box(lat: float, lng: float, radius_km: float):
    """Approximate bounding box for a radius around (lat, lng).

    Used to pre-filter shops in SQL before applying Haversine in Python
    so we avoid PostGIS in v1.
    """
    lat_delta = radius_km / 111.0
    lng_delta = radius_km / (111.0 * max(math.cos(math.radians(lat)), 0.01))
    return lat - lat_delta, lat + lat_delta, lng - lng_delta, lng + lng_delta


def _haversine_km(lat1, lng1, lat2, lng2) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


class ShopPagination(PageNumberPagination):
    """Paginator for the public shops list — grid-friendly page size."""

    page_size = 12
    page_size_query_param = "page_size"
    max_page_size = 48


class ShopCategoryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ShopCategory.objects.all()
    serializer_class = ShopCategorySerializer
    permission_classes = [permissions.AllowAny]


class ShopViewSet(viewsets.ModelViewSet):
    queryset = Shop.objects.all()
    pagination_class = ShopPagination
    filterset_fields = ["status", "city", "categories"]
    search_fields = ["name", "description", "city"]
    ordering_fields = ["created_at", "name"]

    def get_serializer_class(self):
        if self.action == "list":
            return ShopListSerializer
        if self.action in ("create", "update", "partial_update"):
            return ShopWriteSerializer
        return ShopDetailSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve", "nearby"):
            return [permissions.AllowAny()]
        if self.action == "create":
            return [IsShopOwner()]
        return [IsShopOwner()]

    def get_queryset(self):
        qs = super().get_queryset()
        if self.action == "list":
            qs = qs.filter(status=Shop.Status.ACTIVE)
        if self.action in ("update", "partial_update", "destroy"):
            qs = qs.filter(owner=self.request.user)
        return qs

    def create(self, request, *args, **kwargs):
        """Override to return the detail representation (with id, status, etc.)."""
        write_serializer = self.get_serializer(data=request.data)
        write_serializer.is_valid(raise_exception=True)
        self.perform_create(write_serializer)
        shop = write_serializer.instance
        return Response(
            ShopDetailSerializer(shop, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        """Override to return the detail representation."""
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        write_serializer = self.get_serializer(instance, data=request.data, partial=partial)
        write_serializer.is_valid(raise_exception=True)
        self.perform_update(write_serializer)
        return Response(
            ShopDetailSerializer(
                write_serializer.instance, context={"request": request}
            ).data
        )

    def perform_create(self, serializer):
        data = serializer.validated_data
        if not data.get("latitude") or not data.get("longitude"):
            address = ", ".join(
                p
                for p in [
                    data.get("address_line", ""),
                    data.get("city", ""),
                    data.get("postal_code", ""),
                    data.get("country", ""),
                ]
                if p
            )
            coords = geocode_address(address) if address else None
            if coords:
                data["latitude"], data["longitude"] = coords
        shop = serializer.save(owner=self.request.user)
        _ensure_default_hours(shop)
        _ensure_default_resource(shop)

    def perform_update(self, serializer):
        data = serializer.validated_data
        instance = serializer.instance
        address_changed = any(
            field in data and getattr(instance, field) != data[field]
            for field in ("address_line", "city", "postal_code", "country")
        )
        if address_changed and "latitude" not in data and "longitude" not in data:
            new_address = ", ".join(
                p
                for p in [
                    data.get("address_line", instance.address_line),
                    data.get("city", instance.city),
                    data.get("postal_code", instance.postal_code),
                    data.get("country", instance.country),
                ]
                if p
            )
            coords = geocode_address(new_address) if new_address else None
            if coords:
                data["latitude"], data["longitude"] = coords
        serializer.save()

    @action(detail=False, methods=["get"], permission_classes=[permissions.AllowAny])
    def nearby(self, request):
        try:
            lat = float(request.query_params["lat"])
            lng = float(request.query_params["lng"])
            radius = float(request.query_params.get("radius_km", 10))
        except (KeyError, ValueError):
            return Response({"detail": "lat, lng required; radius_km optional"}, status=400)

        min_lat, max_lat, min_lng, max_lng = _bounding_box(lat, lng, radius)
        candidates = self.get_queryset().filter(
            status=Shop.Status.ACTIVE,
            latitude__gte=min_lat,
            latitude__lte=max_lat,
            longitude__gte=min_lng,
            longitude__lte=max_lng,
        )
        results = []
        for shop in candidates:
            if shop.latitude is None or shop.longitude is None:
                continue
            distance = _haversine_km(lat, lng, float(shop.latitude), float(shop.longitude))
            if distance <= radius:
                results.append((distance, shop))
        results.sort(key=lambda x: x[0])
        data = ShopListSerializer(
            [s for _, s in results], many=True, context={"request": request}
        ).data
        for entry, (distance, _) in zip(data, results):
            entry["distance_km"] = round(distance, 2)
        return Response(data)

    @action(detail=False, methods=["get"], permission_classes=[IsShopOwner])
    def mine(self, request):
        shops = Shop.objects.filter(owner=request.user).order_by("-created_at")
        page = self.paginate_queryset(shops)
        if page is not None:
            serializer = ShopListSerializer(
                page, many=True, context={"request": request}
            )
            return self.get_paginated_response(serializer.data)
        return Response(
            ShopListSerializer(shops, many=True, context={"request": request}).data
        )

    @action(
        detail=False,
        methods=["get"],
        url_path="commission-invoices",
        permission_classes=[IsShopOwner],
    )
    def commission_invoices(self, request):
        """This owner's commission invoices across all their shops."""
        from apps.reservations.models import CommissionInvoice
        from apps.reservations.serializers import CommissionInvoiceSerializer

        qs = (
            CommissionInvoice.objects.select_related("shop")
            .filter(shop__owner=request.user)
            .order_by("-period", "shop_id")
        )
        if (status_f := request.query_params.get("status")):
            qs = qs.filter(status=status_f)
        return Response(CommissionInvoiceSerializer(qs, many=True).data)

    @action(detail=True, methods=["post"], permission_classes=[IsShopOwner])
    def publish(self, request, pk=None):
        shop = self.get_object()
        if shop.owner_id != request.user.id:
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        from apps.reservations.commission_billing import _has_blocking_invoice

        if _has_blocking_invoice(shop):
            return Response(
                {
                    "detail": (
                        "Settle the outstanding commission invoice before "
                        "publishing this shop."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        shop.status = Shop.Status.ACTIVE
        shop.auto_paused_for_unpaid_commission = False
        shop.save(
            update_fields=[
                "status",
                "auto_paused_for_unpaid_commission",
                "updated_at",
            ]
        )
        return Response(ShopDetailSerializer(shop, context={"request": request}).data)

    @action(detail=True, methods=["post"], permission_classes=[IsShopOwner])
    def pause(self, request, pk=None):
        shop = self.get_object()
        if shop.owner_id != request.user.id:
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        shop.status = Shop.Status.PAUSED
        shop.save(update_fields=["status", "updated_at"])
        return Response(ShopDetailSerializer(shop, context={"request": request}).data)

    @action(detail=True, methods=["get", "put"], url_path="hours")
    def hours(self, request, pk=None):
        shop = self.get_object()
        if request.method == "GET":
            qs = WeekdayHours.objects.filter(shop=shop).order_by("weekday")
            return Response(WeekdayHoursSerializer(qs, many=True).data)

        if shop.owner_id != request.user.id:
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        payload = request.data
        if not isinstance(payload, list):
            return Response(
                {"detail": "Expected a list of 7 weekday entries."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        seen = set()
        for entry in payload:
            wd = entry.get("weekday")
            if wd is None or wd in seen:
                return Response(
                    {"detail": "Each entry must have a unique weekday (0-6)."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            seen.add(wd)
            WeekdayHours.objects.update_or_create(
                shop=shop,
                weekday=wd,
                defaults={
                    "is_closed": bool(entry.get("is_closed", False)),
                    "open_time": entry.get("open_time") or None,
                    "close_time": entry.get("close_time") or None,
                },
            )
        qs = WeekdayHours.objects.filter(shop=shop).order_by("weekday")
        return Response(WeekdayHoursSerializer(qs, many=True).data)

    @action(
        detail=True,
        methods=["get", "post"],
        url_path="photos",
        parser_classes=[MultiPartParser, FormParser],
    )
    def photos(self, request, pk=None):
        shop = self.get_object()
        if request.method == "GET":
            qs = ShopPhoto.objects.filter(shop=shop).order_by("sort_order", "id")
            return Response(
                ShopPhotoSerializer(qs, many=True, context={"request": request}).data
            )

        if shop.owner_id != request.user.id:
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        image = request.FILES.get("image")
        if image is None:
            return Response({"detail": "image file is required."}, status=400)
        # New uploads go to the back of the queue (after any existing photos)
        # so they don't accidentally replace the cover.
        next_order = (
            ShopPhoto.objects.filter(shop=shop)
            .order_by("-sort_order")
            .values_list("sort_order", flat=True)
            .first()
        )
        photo = ShopPhoto.objects.create(
            shop=shop,
            image=image,
            caption=request.data.get("caption", ""),
            sort_order=(next_order + 1) if next_order is not None else 0,
        )
        return Response(
            ShopPhotoSerializer(photo, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["delete"], url_path=r"photos/(?P<photo_id>\d+)")
    def delete_photo(self, request, pk=None, photo_id=None):
        shop = self.get_object()
        if shop.owner_id != request.user.id:
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        ShopPhoto.objects.filter(shop=shop, id=photo_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path=r"photos/(?P<photo_id>\d+)/cover")
    def set_cover_photo(self, request, pk=None, photo_id=None):
        """Promote a photo to cover by giving it sort_order=0 and bumping others.

        The shop list/detail endpoints derive `cover_photo` from the photo with
        the lowest `(sort_order, id)`, so setting the target to 0 makes it the
        cover unconditionally. We renumber the rest 1..N in their existing
        relative order to keep the sort sequence dense.
        """
        shop = self.get_object()
        if shop.owner_id != request.user.id:
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        target = ShopPhoto.objects.filter(shop=shop, id=photo_id).first()
        if not target:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        with transaction.atomic():
            others = (
                ShopPhoto.objects.filter(shop=shop)
                .exclude(id=target.id)
                .order_by("sort_order", "id")
            )
            target.sort_order = 0
            target.save(update_fields=["sort_order"])
            for i, other in enumerate(others, start=1):
                if other.sort_order != i:
                    other.sort_order = i
                    other.save(update_fields=["sort_order"])
        qs = ShopPhoto.objects.filter(shop=shop).order_by("sort_order", "id")
        return Response(
            ShopPhotoSerializer(qs, many=True, context={"request": request}).data
        )

    @action(detail=True, methods=["get", "post"], url_path="overrides")
    def overrides(self, request, pk=None):
        shop = self.get_object()
        if request.method == "GET":
            qs = HoursOverride.objects.filter(shop=shop).order_by("date")
            return Response(HoursOverrideSerializer(qs, many=True).data)

        if shop.owner_id != request.user.id:
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        serializer = HoursOverrideSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        HoursOverride.objects.update_or_create(
            shop=shop,
            date=serializer.validated_data["date"],
            defaults={
                "is_closed": serializer.validated_data.get("is_closed", False),
                "open_time": serializer.validated_data.get("open_time"),
                "close_time": serializer.validated_data.get("close_time"),
                "note": serializer.validated_data.get("note", ""),
            },
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["delete"], url_path=r"overrides/(?P<override_id>\d+)")
    def delete_override(self, request, pk=None, override_id=None):
        shop = self.get_object()
        if shop.owner_id != request.user.id:
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        HoursOverride.objects.filter(shop=shop, id=override_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["get"], permission_classes=[IsShopOwner])
    def analytics(self, request, pk=None):
        """Per-shop analytics for the owner: revenue, booking volume, no-show rate, top services."""
        from datetime import timedelta
        from decimal import Decimal

        from django.db.models import Count, Sum
        from django.utils import timezone

        from apps.reservations.models import CommissionLedger, Reservation

        shop = self.get_object()
        if shop.owner_id != request.user.id:
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        try:
            days = max(1, min(int(request.query_params.get("days", 30) or 30), 365))
        except ValueError:
            return Response({"detail": "days must be an integer."}, status=400)
        cutoff = timezone.now() - timedelta(days=days)

        reservations = Reservation.objects.filter(shop=shop, start_at__gte=cutoff)
        total = reservations.count()
        completed = reservations.filter(status=Reservation.Status.COMPLETED)
        no_shows = reservations.filter(status=Reservation.Status.NO_SHOW).count()

        revenue = completed.aggregate(s=Sum("total_price"))["s"] or Decimal("0")
        commission = (
            CommissionLedger.objects.filter(shop=shop, created_at__gte=cutoff).aggregate(
                s=Sum("amount")
            )["s"]
            or Decimal("0")
        )

        top_services = (
            completed.values("service__name")
            .annotate(count=Count("id"))
            .order_by("-count")[:5]
        )

        return Response(
            {
                "window_days": days,
                "totals": {
                    "reservations": total,
                    "completed": completed.count(),
                    "no_shows": no_shows,
                    "no_show_rate": (no_shows / total) if total else 0,
                    "revenue": float(revenue),
                    "commission": float(commission),
                    "net_after_commission": float(revenue - commission),
                },
                "top_services": [
                    {"name": row["service__name"], "count": row["count"]} for row in top_services
                ],
            }
        )


def _ensure_default_hours(shop):
    """Pre-populate WeekdayHours for a new shop: closed everywhere by default."""
    existing = set(WeekdayHours.objects.filter(shop=shop).values_list("weekday", flat=True))
    rows = [
        WeekdayHours(shop=shop, weekday=wd, is_closed=True)
        for wd in range(7)
        if wd not in existing
    ]
    if rows:
        WeekdayHours.objects.bulk_create(rows)


def _ensure_default_resource(shop):
    """Every shop needs at least one bookable Resource (its parallel capacity).

    A brand-new shop starts at capacity 1 ("Station 1"); the owner adds more
    (bays/chairs/rooms) and renames them via the Resource endpoints. Without
    this, the shop would have zero capacity and offer no slots.
    """
    if not Resource.objects.filter(shop=shop).exists():
        Resource.objects.create(shop=shop, name=f"{shop.resource_label} 1")


class ResourceViewSet(viewsets.ModelViewSet):
    """Owner-managed bookable Resources (the per-shop parallel capacity)."""

    serializer_class = ResourceSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [permissions.AllowAny()]
        return [IsShopOwner()]

    def get_queryset(self):
        qs = Resource.objects.all()
        shop_id = self.request.query_params.get("shop")
        if shop_id:
            qs = qs.filter(shop_id=shop_id)
        if self.action == "list":
            # Public callers only see active Resources; the owner sees all of
            # their own (so they can re-activate a retired one).
            user = self.request.user
            owns = (
                user.is_authenticated
                and shop_id
                and Shop.objects.filter(pk=shop_id, owner=user).exists()
            )
            if not owns:
                qs = qs.filter(is_active=True)
        if self.action in ("update", "partial_update", "destroy"):
            qs = qs.filter(shop__owner=self.request.user)
        return qs.order_by("id")

    def perform_create(self, serializer):
        shop = serializer.validated_data["shop"]
        if shop.owner_id != self.request.user.id:
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("You do not own this shop.")
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        """Hard-delete only if unused; otherwise retire (is_active=False) so the
        booking history that PROTECTs this Resource stays intact."""
        resource = self.get_object()
        if resource.reservations.exists():
            resource.is_active = False
            resource.save(update_fields=["is_active", "updated_at"])
            return Response(ResourceSerializer(resource).data)
        return super().destroy(request, *args, **kwargs)


class StaffViewSet(viewsets.ModelViewSet):
    serializer_class = StaffSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve", "working_hours"):
            return [permissions.AllowAny()]
        return [IsShopOwner()]

    def get_queryset(self):
        qs = Staff.objects.all()
        shop_id = self.request.query_params.get("shop")
        if shop_id:
            qs = qs.filter(shop_id=shop_id)
        if self.action in ("update", "partial_update", "destroy"):
            qs = qs.filter(shop__owner=self.request.user)
        return qs

    @action(detail=False, methods=["get"], url_path="stats", permission_classes=[IsShopOwner])
    def stats(self, request):
        """Aggregate counts for the staff KPI cards on the owner dashboard.

        Mirrors the `/services/stats/` pattern: requires `?shop=<id>` and that
        the caller owns the shop. Counts run against the whole staff table for
        the shop so they stay stable independent of any list pagination.
        """
        shop_id = request.query_params.get("shop")
        if not shop_id:
            return Response({"detail": "shop is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not Shop.objects.filter(pk=shop_id, owner=request.user).exists():
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        qs = Staff.objects.filter(shop_id=shop_id)
        total = qs.count()
        active = qs.filter(is_active=True).count()
        return Response({
            "total": total,
            "active": active,
            "inactive": total - active,
        })

    @action(detail=True, methods=["get", "put"], url_path="hours")
    def working_hours(self, request, pk=None):
        staff_obj = self.get_object()
        if request.method == "GET":
            qs = StaffWorkingHours.objects.filter(staff=staff_obj).order_by("weekday")
            return Response(StaffWorkingHoursSerializer(qs, many=True).data)

        if staff_obj.shop.owner_id != request.user.id:
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        payload = request.data
        if not isinstance(payload, list):
            return Response({"detail": "Expected list of weekday entries."}, status=400)
        seen = set()
        for entry in payload:
            wd = entry.get("weekday")
            if wd is None or wd in seen:
                return Response(
                    {"detail": "Each entry must have a unique weekday (0-6)."}, status=400
                )
            seen.add(wd)
            StaffWorkingHours.objects.update_or_create(
                staff=staff_obj,
                weekday=wd,
                defaults={
                    "is_off": bool(entry.get("is_off", False)),
                    "start_time": entry.get("start_time") or None,
                    "end_time": entry.get("end_time") or None,
                },
            )
        qs = StaffWorkingHours.objects.filter(staff=staff_obj).order_by("weekday")
        return Response(StaffWorkingHoursSerializer(qs, many=True).data)


class FavoriteViewSet(viewsets.ModelViewSet):
    serializer_class = FavoriteSerializer
    permission_classes = [IsCustomer]
    http_method_names = ["get", "post", "delete"]

    def get_queryset(self):
        return (
            Favorite.objects.filter(customer=self.request.user)
            .select_related("shop")
            .prefetch_related("shop__categories", "shop__photos")
            .order_by("-created_at")
        )

    def perform_create(self, serializer):
        serializer.save(customer=self.request.user)
