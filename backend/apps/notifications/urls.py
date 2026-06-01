from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import MaintenanceReminderViewSet, NotificationViewSet

router = DefaultRouter()
router.register("maintenance-reminders", MaintenanceReminderViewSet, basename="maintenance-reminder")
router.register("", NotificationViewSet, basename="notification")

urlpatterns = [
    path("", include(router.urls)),
]
