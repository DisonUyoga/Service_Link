from rest_framework import serializers

from .models import DiscoveryPayment, Payment


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = (
            "id",
            "job",
            "provider",
            "amount",
            "currency",
            "mpesa_reference",
            "checkout_request_id",
            "merchant_request_id",
            "phone_number",
            "result_code",
            "result_desc",
            "status",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "provider",
            "mpesa_reference",
            "checkout_request_id",
            "merchant_request_id",
            "result_code",
            "result_desc",
            "status",
            "created_at",
            "updated_at",
        )


class DiscoveryPaymentSerializer(serializers.ModelSerializer):
    is_paid = serializers.BooleanField(read_only=True)

    class Meta:
        model = DiscoveryPayment
        fields = (
            "id",
            "customer",
            "amount",
            "currency",
            "phone_number",
            "category_id",
            "lat",
            "lng",
            "query",
            "provider_count",
            "checkout_request_id",
            "merchant_request_id",
            "mpesa_reference",
            "result_code",
            "result_desc",
            "status",
            "is_paid",
            "consumed_job",
            "consumed_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "customer",
            "checkout_request_id",
            "merchant_request_id",
            "mpesa_reference",
            "result_code",
            "result_desc",
            "status",
            "is_paid",
            "consumed_job",
            "consumed_at",
            "created_at",
            "updated_at",
        )

