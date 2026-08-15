from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

admin.site.site_header = "S-Link System Admin"
admin.site.index_title = "S-Link System Admin"
admin.site.site_title = "Welcome to S-Link"

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/accounts/", include("apps.accounts.urls")),
    path("api/services/", include("apps.services.urls")),
    path("api/payments/", include("apps.payments.urls")),
    path("api/ads/", include("apps.ads.urls")),
    path("api/ai/", include("apps.ai.urls")),
    path("api/config/", include("apps.core.urls")),
]

urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)