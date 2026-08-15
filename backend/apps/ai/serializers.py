from rest_framework import serializers


class MatchRequestSerializer(serializers.Serializer):
    description = serializers.CharField(required=False, allow_blank=True)
    lat = serializers.FloatField()
    lng = serializers.FloatField()

    # Accept all names because your Flutter/backend versions have used
    # different keys at different times.
    category = serializers.IntegerField(required=False)
    category_id = serializers.IntegerField(required=False)
    category_name = serializers.CharField(required=False, allow_blank=True)

    price_preference = serializers.CharField(required=False, allow_blank=True)
    urgency = serializers.CharField(required=False, allow_blank=True)
    budget_min = serializers.FloatField(required=False)
    budget_max = serializers.FloatField(required=False)
    budget_amount = serializers.FloatField(required=False)
    priority = serializers.CharField(required=False, allow_blank=True)
    radius_km = serializers.FloatField(required=False)
    exclude_user_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
    )


class PricePredictionRequestSerializer(serializers.Serializer):
    provider_id = serializers.IntegerField(required=False)
    category_id = serializers.IntegerField(required=False)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    lat = serializers.FloatField()
    lng = serializers.FloatField()
    price_preference = serializers.ChoiceField(choices=["budget", "standard", "premium"], required=False)
    urgency = serializers.ChoiceField(choices=["low", "normal", "high", "emergency"], required=False, default="normal")


class FeedbackSummarySerializer(serializers.Serializer):
    provider_id = serializers.IntegerField()

