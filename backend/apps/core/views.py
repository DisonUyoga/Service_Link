"""Public runtime configuration consumed by the mobile + web clients.

Exposed as ``GET /api/config/``. The mobile app fetches this once on
startup so feature flags can be flipped server-side without shipping a
new build.
"""

from django.conf import settings
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView


class AppConfigView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, *args, **kwargs):
        return Response(
            {
                "connection_fee_enabled": getattr(
                    settings, "CONNECTION_FEE_ENABLED", False
                ),
                "connection_fee_kes": getattr(
                    settings, "CONNECTION_FEE_KES", 50
                ),
                "geofence_default_radius_km": getattr(
                    settings, "GEOFENCE_DEFAULT_RADIUS_KM", 10
                ),
                "geofence_max_radius_km": getattr(
                    settings, "GEOFENCE_MAX_RADIUS_KM", 30
                ),
                "arrival_notification_meters": getattr(
                    settings, "ARRIVAL_NOTIFICATION_METERS", 500
                ),
                "provider_response_timeout_min": getattr(
                    settings, "PROVIDER_RESPONSE_TIMEOUT_MIN", 5
                ),
            }
        )
