from django.contrib.auth import get_user_model

from rest_framework import generics, permissions, status
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .serializers import RegisterSerializer


User = get_user_model()


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]


def _is_provider_blocked(user) -> tuple[bool, str | None]:
    """Decide whether ``user`` should be allowed to obtain a JWT.

    Providers must be verified by an admin before they can log in. The only
    exception is providers who haven't completed onboarding yet — they are
    allowed in so they can finish their profile (the admin can't verify
    them until then). Once a profile exists and ``verified=False``, login
    is blocked with a friendly message.

    Suspended providers are also blocked here for completeness.

    Returns ``(blocked, message)``.
    """
    if getattr(user, "role", None) != "provider":
        return False, None

    # Local import to avoid circular dependency between accounts <-> services.
    from apps.services.models import ServiceProviderProfile

    profile = ServiceProviderProfile.objects.filter(user=user).first()
    if profile is None:
        # Hasn't onboarded yet — allow login so they can.
        return False, None

    if profile.is_suspended:
        return True, (
            "Your provider account has been suspended. "
            "Please contact support."
        )
    if not profile.verified:
        return True, (
            "Your provider profile is awaiting verification by an admin. "
            "You'll be able to log in once it's approved."
        )
    return False, None


class GatekeepingTokenObtainPairSerializer(TokenObtainPairSerializer):
    """JWT serializer that blocks unverified / suspended providers."""

    def validate(self, attrs):
        data = super().validate(attrs)
        blocked, message = _is_provider_blocked(self.user)
        if blocked:
            raise AuthenticationFailed(
                detail={"detail": message, "code": "provider_not_verified"},
                code="provider_not_verified",
            )
        # Useful extras the mobile app can read after login.
        data["role"] = getattr(self.user, "role", "customer")
        data["username"] = self.user.username
        return data


class GatekeepingTokenObtainPairView(TokenObtainPairView):
    serializer_class = GatekeepingTokenObtainPairSerializer


class GoogleLoginView(APIView):
    """Create/login a customer using their Google account."""

    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        email = request.data.get("email")
        name = request.data.get("name", "")
        if not email:
            return Response(
                {"detail": "email is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                "username": email.split("@")[0],
                "role": "customer",
            },
        )

        # Same gate as username/password login — providers cannot use Google
        # SSO to bypass the verification step.
        blocked, message = _is_provider_blocked(user)
        if blocked:
            return Response(
                {"detail": message, "code": "provider_not_verified"},
                status=status.HTTP_403_FORBIDDEN,
            )

        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "created": created,
                "user": {
                    "id": user.id,
                    "username": user.username,
                    "email": user.email,
                    "role": user.role,
                    "name": name,
                },
            }
        )


TokenObtainPairView  # re-export for urls
TokenRefreshView

