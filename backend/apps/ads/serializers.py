from rest_framework import serializers

from .models import AdPlacement


class AdPlacementSerializer(serializers.ModelSerializer):
    class Meta:
        model = AdPlacement
        fields = "__all__"
        read_only_fields = ("sponsor", "status", "created_at")


class PublicAdSerializer(serializers.ModelSerializer):
    sponsor_name = serializers.SerializerMethodField()

    class Meta:
        model = AdPlacement
        fields = (
            "id",
            "title",
            "description",
            "category",
            "target_country",
            "target_city",
            "store_lat",
            "store_lng",
            "starts_at",
            "ends_at",
            "sponsor_name",
        )

    def get_sponsor_name(self, obj):
        user = obj.sponsor
        if not user:
            return None
        return user.get_full_name() or user.username

