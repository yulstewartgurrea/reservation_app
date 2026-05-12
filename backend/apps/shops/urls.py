from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import FavoriteViewSet, ShopCategoryViewSet, ShopViewSet, StaffViewSet

router = DefaultRouter()
router.register("categories", ShopCategoryViewSet, basename="shop-category")
router.register("staff", StaffViewSet, basename="staff")
router.register("favorites", FavoriteViewSet, basename="favorite")
router.register("", ShopViewSet, basename="shop")

urlpatterns = [
    path("", include(router.urls)),
]
