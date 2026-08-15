from django.contrib.auth import get_user_model
from rest_framework import serializers
from .matching import distance_km, provider_location

from .models import (
    ServiceCategory,
    ServiceProviderProfile,
    JobRequest,
    Rating,
    ProviderLocation,
    ProviderLegalDocument,
)


User = get_user_model()


class ServiceCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceCategory
        fields = ("id", "name", "icon")


class ProviderListSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    user_name = serializers.CharField(source="user.username")
    distance_km = serializers.SerializerMethodField()
    ai_score = serializers.FloatField(read_only=True)
    ai_reason = serializers.CharField(read_only=True)
    wait_minutes = serializers.IntegerField(read_only=True)
    predicted_price = serializers.IntegerField(read_only=True)
    price_prediction_confidence = serializers.FloatField(read_only=True)
    price_prediction_reason = serializers.CharField(read_only=True)
    location_source = serializers.SerializerMethodField()
    last_seen_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = ServiceProviderProfile
        fields = (
            "id",
            "user_id",
            "user_name",
            "category",
            "bio",
            "base_lat",
            "base_lng",
            "current_lat",
            "current_lng",
            "last_seen_at",
            "location_source",
            "tier",
            "rating_avg",
            "rating_count",
            "total_jobs_completed",
            "service_radius_km",
            "price_min",
            "price_max",
            "average_response_minutes",
            "current_status",
            "distance_km",
            "ai_score",
            "ai_reason",
            "wait_minutes",
            "predicted_price",
            "price_prediction_confidence",
            "price_prediction_reason",
        )

    def get_distance_km(self, obj):
        request = self.context.get("request")
        if not request:
            return None
        try:
            lat = float(request.query_params.get("lat"))
            lng = float(request.query_params.get("lng"))
        except (TypeError, ValueError):
            return None
        # Use the same coords the matcher uses (live first, then base
        # fallback if enabled).
        p_lat, p_lng, _ = provider_location(obj)
        if p_lat is None:
            return None
        return round(distance_km(lat, lng, p_lat, p_lng), 2)

    def get_location_source(self, obj):
        # Annotated by rank_providers; fall back to a fresh lookup if
        # someone serializes a profile that didn't go through ranking.
        if hasattr(obj, "location_source"):
            return obj.location_source
        _, _, source = provider_location(obj)
        return source


class JobRequestSerializer(serializers.ModelSerializer):
    latest_location = serializers.SerializerMethodField()
    category_name = serializers.CharField(source="category.name", read_only=True)
    customer_name = serializers.CharField(source="customer.username", read_only=True)
    provider_name = serializers.CharField(source="provider.username", read_only=True)

    class Meta:
        model = JobRequest
        fields = (
            "id",
            "customer",
            "provider",
            "provider_name",
            "category",
            "category_name",
            "customer_name",
            "description",
            "location_lat",
            "location_lng",
            "address_text",
            "status",
            "created_at",
            "updated_at",
            "is_paid",
            "latest_location",
            "provider_access_otp",
            "provider_access_token",
            "ai_match_reason",
            "client_price_preference",
            "quoted_price",
            "requested_radius_km",
            "pending_since",
            "request_sms_sent_at",
            "arrival_sms_sent_at",
            "expired_at",
            "fallback_provider_id",
        )
        read_only_fields = (
            "status",
            "customer",
            "created_at",
            "updated_at",
            "is_paid",
            "latest_location",
            "provider_access_otp",
            "provider_access_token",
            "ai_match_reason",
            "pending_since",
            "request_sms_sent_at",
            "arrival_sms_sent_at",
            "expired_at",
            "fallback_provider_id",
        )

    def get_latest_location(self, obj):
        loc = obj.locations.order_by("-recorded_at").first()
        if not loc:
            return None
        return {
            "lat": loc.lat,
            "lng": loc.lng,
            "recorded_at": loc.recorded_at,
        }


class RatingSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(
        source="customer.username",
        read_only=True,
    )
    provider_name = serializers.CharField(
        source="provider.username",
        read_only=True,
    )

    class Meta:
        model = Rating
        fields = (
            "id",
            "job",
            "customer",
            "customer_name",
            "provider",
            "provider_name",
            "score",
            "comment",
            "created_at",
        )
        read_only_fields = (
            "id",
            "customer",
            "customer_name",
            "provider",
            "provider_name",
            "created_at",
        )

    def validate_score(self, value):
        if value < 1 or value > 5:
            raise serializers.ValidationError("Rating must be between 1 and 5.")
        return value

    def validate(self, attrs):
        request = self.context["request"]
        job = attrs["job"]

        if job.customer != request.user:
            raise serializers.ValidationError(
                "You can only rate your own completed jobs."
            )

        if job.status != "completed":
            raise serializers.ValidationError(
                "You can only rate a completed job."
            )

        if not job.provider:
            raise serializers.ValidationError(
                "This job has no provider to rate."
            )

        if Rating.objects.filter(job=job).exists():
            raise serializers.ValidationError(
                "This job has already been rated."
            )

        return attrs


class ProviderAnalyticsSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.username")

    class Meta:
        model = ServiceProviderProfile
        fields = (
            "id",
            "user_name",
            "tier",
            "rating_avg",
            "rating_count",
            "total_jobs_completed",
            "service_radius_km",
            "price_min",
            "price_max",
            "average_response_minutes",
            "current_status",
        )


class ProviderLegalDocumentSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    provider_username = serializers.CharField(
        source="profile.user.username",
        read_only=True,
    )

    class Meta:
        model = ProviderLegalDocument
        fields = (
            "id",
            "title",
            "file",
            "file_url",
            "provider_username",
            "uploaded_at",
        )
        read_only_fields = (
            "id",
            "file_url",
            "provider_username",
            "uploaded_at",
        )

    def get_file_url(self, obj):
        request = self.context.get("request")

        if not obj.file:
            return None

        if request:
            return request.build_absolute_uri(obj.file.url)

        return obj.file.url

