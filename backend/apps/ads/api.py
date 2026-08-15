from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import AdPlacement
from .serializers import AdPlacementSerializer, PublicAdSerializer


class AdPlacementViewSet(viewsets.ModelViewSet):
    """CRUD for advertisers (service providers or stores) to manage their ads."""

    serializer_class = AdPlacementSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
      return AdPlacement.objects.filter(sponsor=self.request.user)

    def perform_create(self, serializer):
      serializer.save(sponsor=self.request.user, status="pending_review")


class PublicAdsViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only view of active ads filtered by location/category for customers/providers."""

    serializer_class = PublicAdSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
      category = self.request.query_params.get("category")
      country = self.request.query_params.get("country")
      city = self.request.query_params.get("city")
      qs = AdPlacement.objects.filter(status="active")
      if category:
        qs = qs.filter(category__iexact=category)
      if country:
        qs = qs.filter(target_country__iexact=country)
      if city:
        qs = qs.filter(target_city__iexact=city)
      return qs

