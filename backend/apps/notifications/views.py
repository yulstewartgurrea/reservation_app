from django.utils import timezone
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.permissions import IsShopOwner

from .models import MaintenanceReminder, Notification
from .serializers import MaintenanceReminderSerializer, NotificationSerializer


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user)

    @action(detail=True, methods=["post"], url_path="mark-read")
    def mark_read(self, request, pk=None):
        notification = self.get_object()
        if notification.read_at is None:
            notification.read_at = timezone.now()
            notification.save(update_fields=["read_at"])
        return Response(NotificationSerializer(notification).data)

    @action(detail=False, methods=["post"], url_path="mark-all-read")
    def mark_all_read(self, request):
        count = self.get_queryset().filter(read_at__isnull=True).update(read_at=timezone.now())
        return Response({"marked": count})


class MaintenanceReminderViewSet(viewsets.ModelViewSet):
    """Shop-owner-only CRUD over their own shop's maintenance reminders."""

    serializer_class = MaintenanceReminderSerializer
    permission_classes = [IsShopOwner]
    filterset_fields = ["shop", "is_active"]

    def get_queryset(self):
        return (
            MaintenanceReminder.objects.select_related("shop", "customer", "service")
            .filter(shop__owner=self.request.user)
        )

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
