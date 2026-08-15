from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .api import AdPlacementViewSet, PublicAdsViewSet

router = DefaultRouter()
router.register("my", AdPlacementViewSet, basename="my-ads")
router.register("public", PublicAdsViewSet, basename="public-ads")

urlpatterns = [
    path("", include(router.urls)),
]

