from django.urls import path

from .views import (
    confirm_dev_payment,
    paymongo_webhook,
    refund_payment_view,
    start_payment,
)

urlpatterns = [
    path("reservations/<int:reservation_id>/checkout/", start_payment, name="payments_checkout"),
    path(
        "reservations/<int:reservation_id>/dev-confirm/",
        confirm_dev_payment,
        name="payments_dev_confirm",
    ),
    path(
        "reservations/<int:reservation_id>/refund/",
        refund_payment_view,
        name="payments_refund",
    ),
    path("webhooks/paymongo/", paymongo_webhook, name="paymongo_webhook"),
]
