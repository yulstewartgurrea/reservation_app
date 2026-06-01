from django.urls import path

from .views import (
    confirm_dev_invoice_payment,
    confirm_dev_payment,
    pay_commission_invoice,
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
    path(
        "commission-invoices/<int:invoice_id>/pay/",
        pay_commission_invoice,
        name="payments_commission_invoice_pay",
    ),
    path(
        "commission-invoices/<int:invoice_id>/confirm-dev/",
        confirm_dev_invoice_payment,
        name="payments_commission_invoice_dev_confirm",
    ),
    path("webhooks/paymongo/", paymongo_webhook, name="paymongo_webhook"),
]
