from django.urls import path

from .views import approve_shop, commission_ledger, overview, pending_shops

urlpatterns = [
    path("overview/", overview, name="admin_overview"),
    path("pending-shops/", pending_shops, name="admin_pending_shops"),
    path("shops/<int:shop_id>/approve/", approve_shop, name="admin_approve_shop"),
    path("commission/", commission_ledger, name="admin_commission_ledger"),
]
