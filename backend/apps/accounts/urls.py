from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .api import RegisterView, GoogleLoginView, GatekeepingTokenObtainPairView
from .views import MeView

urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("google-login/", GoogleLoginView.as_view(), name="google-login"),
    path("token/", GatekeepingTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("me/", MeView.as_view(), name="me"),
]

