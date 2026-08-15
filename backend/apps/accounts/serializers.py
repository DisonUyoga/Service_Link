from django.contrib.auth import get_user_model
from rest_framework import serializers


User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "password",
            "role",
            "first_name",
            "last_name",
            "phone_number",
        )

    def validate_phone_number(self, value):
        return _normalize_msisdn(value)

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


def _normalize_msisdn(raw: str) -> str:
    if not raw:
        return ""
    cleaned = raw.strip().replace(" ", "").replace("-", "")
    if cleaned.startswith("+"):
        cleaned = cleaned[1:]
    if cleaned.startswith("0") and len(cleaned) >= 10:
        cleaned = "254" + cleaned[1:]
    if not cleaned.isdigit() or len(cleaned) < 10:
        raise serializers.ValidationError(
            "Enter a valid phone number (e.g. 0712345678 or 254712345678)."
        )
    return cleaned

