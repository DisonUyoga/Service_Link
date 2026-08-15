from django.conf import settings
from django.db import models


User = settings.AUTH_USER_MODEL


class AdPlacement(models.Model):
    STATUS_CHOICES = [
        ("pending_review", "Pending review"),
        ("active", "Active"),
        ("paused", "Paused"),
    ]

    sponsor = models.ForeignKey(User, on_delete=models.CASCADE, related_name="ads")
    title = models.CharField(max_length=128)
    description = models.TextField(blank=True)
    category = models.CharField(max_length=64, blank=True)  # e.g. tools, materials
    target_country = models.CharField(max_length=64, blank=True)
    target_city = models.CharField(max_length=64, blank=True)
    store_lat = models.FloatField(null=True, blank=True)
    store_lng = models.FloatField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default="pending_review")
    amount_paid = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return self.title

