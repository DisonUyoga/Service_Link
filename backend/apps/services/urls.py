from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .api import (
    CategoryListView,
    NearbyProvidersView,
    JobViewSet,
    RatingViewSet,
    ProviderOnboardingView,
    ProviderAnalyticsView,
    MyProviderAnalyticsView,
    ProviderListAdminView,
    ProviderLegalDocumentUploadView,
    ProviderHeartbeatView,
    ProviderHeartbeatStatusView,
    ServiceAutocompleteView,
    ProviderSessionAccessView,
    AdminProviderLiveLocationsView,
    admin_provider_monitor_page,
)

router = DefaultRouter()
router.register("jobs", JobViewSet, basename="job")
router.register("ratings", RatingViewSet, basename="rating")

urlpatterns = [
    path("categories/", CategoryListView.as_view(), name="categories"),
    path("providers/nearby/", NearbyProvidersView.as_view(), name="nearby-providers"),
    path("autocomplete/", ServiceAutocompleteView.as_view(), name="service-autocomplete"),
    path("provider-session/<str:token>/", ProviderSessionAccessView.as_view(), name="provider-session"),
    path("providers/me/", ProviderOnboardingView.as_view(), name="provider-me"),
    path(
        "providers/me/heartbeat/",
        ProviderHeartbeatView.as_view(),
        name="provider-me-heartbeat",
    ),
    path(
        "providers/me/heartbeat/status/",
        ProviderHeartbeatStatusView.as_view(),
        name="provider-me-heartbeat-status",
    ),
    path("providers/<int:pk>/analytics/", ProviderAnalyticsView.as_view(), name="provider-analytics"),
    path("providers/me/analytics/", MyProviderAnalyticsView.as_view(), name="provider-me-analytics"),
    path(
        "providers/me/documents/",
        ProviderLegalDocumentUploadView.as_view(),
        name="provider-me-documents",
    ),
    path("providers/admin/", ProviderListAdminView.as_view(), name="providers-admin"),
    path("admin/monitor/providers/", admin_provider_monitor_page, name="admin-provider-monitor"),
    path("admin/monitor/providers/live/", AdminProviderLiveLocationsView.as_view(), name="admin-provider-live-locations"),
    path("", include(router.urls)),
]

