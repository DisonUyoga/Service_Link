from django.contrib import admin

from .models import AdPlacement


@admin.register(AdPlacement)
class AdAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "sponsor", "status", "amount_paid", "created_at")
    list_filter = ("status", "category")

