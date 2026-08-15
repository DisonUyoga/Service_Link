from django.urls import path

from .views import AppConfigView


urlpatterns = [
    path("", AppConfigView.as_view(), name="app-config"),
]
