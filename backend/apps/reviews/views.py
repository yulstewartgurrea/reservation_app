from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Review
from .serializers import ReviewSerializer, ShopReplySerializer


class ReviewViewSet(viewsets.ModelViewSet):
    serializer_class = ReviewSerializer
    filterset_fields = ["shop", "rating"]
    ordering_fields = ["created_at", "rating"]

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        return Review.objects.select_related("customer", "shop", "reservation").all()

    def perform_destroy(self, instance):
        if instance.customer_id != self.request.user.id:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You can only delete your own review.")
        super().perform_destroy(instance)

    @action(detail=True, methods=["post"], url_path="reply")
    def reply(self, request, pk=None):
        review = self.get_object()
        if review.shop.owner_id != request.user.id:
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        serializer = ShopReplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        review.shop_reply = serializer.validated_data["shop_reply"]
        review.save(update_fields=["shop_reply", "updated_at"])
        return Response(ReviewSerializer(review).data)
