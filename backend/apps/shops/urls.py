from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    FavoriteViewSet,
    ResourceViewSet,
    ShopCategoryViewSet,
    ShopViewSet,
    StaffViewSet,
    TimeBlockViewSet,
)

router = DefaultRouter()
router.register("categories", ShopCategoryViewSet, basename="shop-category")
router.register("staff", StaffViewSet, basename="staff")
router.register("resources", ResourceViewSet, basename="resource")
router.register("favorites", FavoriteViewSet, basename="favorite")
router.register("time-blocks", TimeBlockViewSet, basename="time-block")
router.register("", ShopViewSet, basename="shop")

urlpatterns = [
    path("", include(router.urls)),
]
