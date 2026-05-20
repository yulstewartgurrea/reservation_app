from django.urls import path

from .views import (
    approve_shop,
    commission_invoices,
    commission_ledger,
    generate_commission_invoices,
    overview,
    pending_shops,
    settle_commission_invoice,
    void_commission_invoice,
)

urlpatterns = [
    path("overview/", overview, name="admin_overview"),
    path("pending-shops/", pending_shops, name="admin_pending_shops"),
    path("shops/<int:shop_id>/approve/", approve_shop, name="admin_approve_shop"),
    path("commission/", commission_ledger, name="admin_commission_ledger"),
    path(
        "commission/invoices/",
        commission_invoices,
        name="admin_commission_invoices",
    ),
    path(
        "commission/invoices/generate/",
        generate_commission_invoices,
        name="admin_commission_invoices_generate",
    ),
    path(
        "commission/invoices/<int:invoice_id>/settle/",
        settle_commission_invoice,
        name="admin_commission_invoice_settle",
    ),
    path(
        "commission/invoices/<int:invoice_id>/void/",
        void_commission_invoice,
        name="admin_commission_invoice_void",
    ),
]
