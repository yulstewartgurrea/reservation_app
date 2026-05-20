from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .availability import compute_slots_any
from .models import Reservation
from .serializers import (
    AvailabilityRequestSerializer,
    CustomerBookingSerializer,
    ReservationDetailSerializer,
    ReservationListSerializer,
    WalkInSerializer,
)
from .services import (
    create_customer_reservation,
    create_walk_in,
    reschedule as _reschedule,
    transition,
)


class ReservationViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields = ["status", "shop", "service"]
    ordering_fields = ["start_at", "created_at"]
    http_method_names = ["get", "post", "patch", "delete"]

    def get_serializer_class(self):
        if self.action == "list":
            return ReservationListSerializer
        return ReservationDetailSerializer

    def get_queryset(self):
        user = self.request.user
        qs = Reservation.objects.select_related("shop", "service", "staff", "customer")
        if user.is_shop_owner:
            return qs.filter(shop__owner=user)
        return qs.filter(customer=user)

    @action(detail=False, methods=["post"], url_path="book")
    def book(self, request):
        serializer = CustomerBookingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reservation = create_customer_reservation(
            customer=request.user,
            **serializer.validated_data,
        )
        return Response(
            ReservationDetailSerializer(reservation).data, status=status.HTTP_201_CREATED
        )

    @action(detail=False, methods=["post"], url_path="walk-in")
    def walk_in(self, request):
        if not request.user.is_shop_owner:
            return Response({"detail": "Shop owner only."}, status=status.HTTP_403_FORBIDDEN)
        serializer = WalkInSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reservation = create_walk_in(
            shop_owner=request.user,
            **serializer.validated_data,
        )
        return Response(
            ReservationDetailSerializer(reservation).data, status=status.HTTP_201_CREATED
        )

    @action(detail=False, methods=["get"], url_path="availability", permission_classes=[permissions.AllowAny])
    def availability(self, request):
        serializer = AvailabilityRequestSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        quantity = d.get("quantity", 1)
        # Availability is resource-capacity based. A requested `staff` (if sent)
        # is non-binding and never narrows the offered times.
        slots = compute_slots_any(d["shop"], d["service"], d["date"], quantity)
        return Response([
            {"start_at": s.start_at.isoformat(), "end_at": s.end_at.isoformat()}
            for s in slots
        ])

    @action(detail=True, methods=["post"], url_path="confirm")
    def confirm(self, request, pk=None):
        reservation = self.get_object()
        if not request.user.is_shop_owner or reservation.shop.owner_id != request.user.id:
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        transition(reservation=reservation, to_status=Reservation.Status.CONFIRMED, actor=request.user)
        return Response(ReservationDetailSerializer(reservation).data)

    @action(detail=True, methods=["post"], url_path="complete")
    def complete(self, request, pk=None):
        reservation = self.get_object()
        if not request.user.is_shop_owner or reservation.shop.owner_id != request.user.id:
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        transition(reservation=reservation, to_status=Reservation.Status.COMPLETED, actor=request.user)
        return Response(ReservationDetailSerializer(reservation).data)

    @action(detail=True, methods=["post"], url_path="no-show")
    def no_show(self, request, pk=None):
        reservation = self.get_object()
        if not request.user.is_shop_owner or reservation.shop.owner_id != request.user.id:
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        transition(reservation=reservation, to_status=Reservation.Status.NO_SHOW, actor=request.user)
        return Response(ReservationDetailSerializer(reservation).data)

    @action(detail=True, methods=["post"], url_path="reschedule")
    def reschedule(self, request, pk=None):
        from django.utils.dateparse import parse_datetime

        reservation = self.get_object()
        is_owner = request.user.is_shop_owner and reservation.shop.owner_id == request.user.id
        is_customer = reservation.customer_id == request.user.id
        if not (is_owner or is_customer):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        raw = request.data.get("start_at")
        new_start = parse_datetime(raw) if raw else None
        if new_start is None:
            return Response({"detail": "start_at is required (ISO datetime)."}, status=400)

        raw_qty = request.data.get("quantity")
        new_qty = int(raw_qty) if raw_qty not in (None, "") else None
        _reschedule(
            reservation=reservation,
            new_start=new_start,
            actor=request.user,
            quantity=new_qty,
        )
        return Response(ReservationDetailSerializer(reservation).data)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        reservation = self.get_object()
        reason = request.data.get("reason", "")
        if request.user.is_shop_owner and reservation.shop.owner_id == request.user.id:
            to_status = Reservation.Status.CANCELLED_BY_SHOP
        elif reservation.customer_id == request.user.id:
            to_status = Reservation.Status.CANCELLED_BY_CUSTOMER
        else:
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        transition(reservation=reservation, to_status=to_status, actor=request.user, reason=reason)
        return Response(ReservationDetailSerializer(reservation).data)
