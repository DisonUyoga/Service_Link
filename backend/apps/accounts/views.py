from django.contrib.auth import get_user_model
from rest_framework import generics, permissions

from .serializers import RegisterSerializer, _normalize_msisdn


User = get_user_model()


class MeView(generics.RetrieveUpdateAPIView):
    """Read or update the authenticated user's profile (e.g. phone number)."""

    serializer_class = RegisterSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "patch", "put", "head", "options"]

    def get_object(self):
        return self.request.user

    def perform_update(self, serializer):
        phone = serializer.validated_data.get("phone_number")
        if phone:
            serializer.validated_data["phone_number"] = _normalize_msisdn(phone)
        serializer.save()

