from rest_framework import serializers

from .models import ServiceCategory, ServiceProviderProfile


class ProviderOnboardingSerializer(serializers.ModelSerializer):
    category_id = serializers.PrimaryKeyRelatedField(
        source="category",
        queryset=ServiceCategory.objects.all(),
        write_only=True,
        required=True,
    )

    category = serializers.SerializerMethodField()
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    user_name = serializers.SerializerMethodField()
    user_email = serializers.EmailField(source="user.email", read_only=True)
    profile_complete = serializers.SerializerMethodField()

    class Meta:
        model = ServiceProviderProfile
        fields = [
            "id",
            "user_id",
            "user_name",
            "user_email",
            "category",
            "category_id",
            "bio",
            "base_lat",
            "base_lng",
            "service_radius_km",
            "price_min",
            "price_max",
            "average_response_minutes",
            "current_status",
            "mpesa_till_or_paybill",
            "verified",
            "profile_complete",
        ]

        read_only_fields = [
            "id",
            "user_id",
            "user_name",
            "user_email",
            "category",
            "verified",
            "profile_complete",
        ]

    def get_category(self, obj):
        if not obj.category_id:
            return None

        return {
            "id": obj.category_id,
            "name": obj.category.name,
        }

    def get_user_name(self, obj):
        return obj.user.get_full_name() or obj.user.username

    def get_profile_complete(self, obj):
        has_category = bool(obj.category_id)
        has_bio = bool((obj.bio or "").strip())
        has_location = obj.base_lat is not None and obj.base_lng is not None
        has_pricing = bool(
            obj.price_min
            and obj.price_max
            and obj.price_min <= obj.price_max
        )

        return has_category and has_bio and has_location and has_pricing

    def validate(self, attrs):
        attrs = super().validate(attrs)

        price_min = attrs.get(
            "price_min",
            getattr(self.instance, "price_min", None),
        )
        price_max = attrs.get(
            "price_max",
            getattr(self.instance, "price_max", None),
        )

        if price_min and price_max and price_min > price_max:
            raise serializers.ValidationError({
                "price_max": "Maximum price must be greater than minimum price."
            })

        return attrs