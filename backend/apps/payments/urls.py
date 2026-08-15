from django.urls import path

from .api import (
    InitiateDiscoveryPaymentView,
    InitiatePaymentView,
    MpesaCallbackView,
    query_discovery_payment,
    query_payment,
)

urlpatterns = [
    path("initiate/", InitiatePaymentView.as_view(), name="payment-initiate"),
    path(
        "discovery/initiate/",
        InitiateDiscoveryPaymentView.as_view(),
        name="discovery-initiate",
    ),
    path(
        "discovery/<int:discovery_id>/",
        query_discovery_payment,
        name="discovery-query",
    ),
    path("mpesa/callback/", MpesaCallbackView.as_view(), name="mpesa-callback"),
    path("query/<int:job_id>/", query_payment, name="payment-query"),
]

