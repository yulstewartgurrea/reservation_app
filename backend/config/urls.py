from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.urls import path, include
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularSwaggerView,
)

def health(_request):
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("health/", health, name="health"),

    path("api/auth/", include("apps.accounts.urls")),
    path("api/shops/", include("apps.shops.urls")),
    path("api/services/", include("apps.services.urls")),
    path("api/reservations/", include("apps.reservations.urls")),
    path("api/reviews/", include("apps.reviews.urls")),
    path("api/notifications/", include("apps.notifications.urls")),
    path("api/admin-panel/", include("apps.admin_panel.urls")),
    path("api/payments/", include("apps.payments.urls")),
    path("api/chat/", include("apps.chat.urls")),
    path("api/locations/", include("apps.locations.urls")),
    path("api/support/", include("apps.support.urls")),

    # Inbound email delivery events (Resend, via Anymail). Anymail's view verifies
    # the provider signature and fires the `tracking` signal handled in
    # apps.core.email_events. Resend's endpoint resolves to:
    #   /api/email/webhooks/resend/tracking/
    path("api/email/webhooks/", include("anymail.urls")),

    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
