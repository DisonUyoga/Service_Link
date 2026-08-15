from django.contrib import admin

from django.urls import reverse
from django.utils.html import format_html

from .models import ServiceCategory, ServiceProviderProfile, JobRequest, Rating, ProviderLocation, ProviderLegalDocument


@admin.register(ServiceCategory)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("id", "name")
    search_fields = ("name",)


@admin.register(ServiceProviderProfile)
class ProviderAdmin(admin.ModelAdmin):
    def monitor_link(self, obj):
        url = reverse("admin-provider-monitor")
        return format_html('<a href="{}" target="_blank">Open live monitor</a>', url)
    monitor_link.short_description = "Live monitor"

    list_display = ("id", "user", "category", "tier", "current_status", "price_min", "price_max", "verified", "is_suspended", "monitor_link")
    list_filter = ("tier", "current_status", "verified", "is_suspended", "category")
    search_fields = ("user__username", "user__email")


@admin.register(JobRequest)
class JobAdmin(admin.ModelAdmin):
    list_display = ("id", "customer", "provider", "category", "status", "created_at")
    list_filter = ("status", "category")
    search_fields = ("customer__username", "provider__username")


@admin.register(Rating)
class RatingAdmin(admin.ModelAdmin):
    list_display = ("id", "job", "provider", "score", "created_at")
    list_filter = ("score",)



@admin.register(ProviderLocation)
class ProviderLocationAdmin(admin.ModelAdmin):
    list_display = ("id", "provider", "job", "lat", "lng", "recorded_at")
    list_filter = ("recorded_at",)
    search_fields = ("provider__username", "job__address_text")
    ordering = ("-recorded_at",)


@admin.register(ProviderLegalDocument)
class ProviderLegalDocumentAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "provider_username",
        "title",
        "uploaded_at",
        "file_link",
    )
    search_fields = (
        "profile__user__username",
        "profile__user__email",
        "title",
    )
    list_filter = ("uploaded_at",)
    ordering = ("-uploaded_at",)

    def provider_username(self, obj):
        return obj.profile.user.username

    provider_username.short_description = "Provider"

    def file_link(self, obj):
        if not obj.file:
            return "-"

        return format_html(
            '<a href="{}" target="_blank">Open file</a>',
            obj.file.url,
        )

    file_link.short_description = "File"
