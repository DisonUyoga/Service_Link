from django.conf import settings
from django.db import models


User = settings.AUTH_USER_MODEL


class ServiceCategory(models.Model):
    name = models.CharField(max_length=64, unique=True)
    icon = models.CharField(max_length=32, blank=True)

    def __str__(self) -> str:
        return self.name


class ServiceProviderProfile(models.Model):
    TIER_CHOICES = [
        ("bronze", "Bronze"),
        ("silver", "Silver"),
        ("gold", "Gold"),
        ("platinum", "Platinum"),
    ]
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    category = models.ForeignKey(ServiceCategory, on_delete=models.PROTECT)
    bio = models.TextField(blank=True)
    # base_lat/lng come from onboarding and act as a fallback (e.g. shop
    # address) when no live heartbeat is available.
    base_lat = models.FloatField(null=True, blank=True)
    base_lng = models.FloatField(null=True, blank=True)
    # current_lat/lng are the freshest GPS reading from the provider's
    # phone, pushed via /api/services/providers/me/heartbeat/. These are
    # the coordinates the matcher uses when ranking providers.
    current_lat = models.FloatField(null=True, blank=True)
    current_lng = models.FloatField(null=True, blank=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    service_radius_km = models.PositiveIntegerField(default=10)
    tier = models.CharField(max_length=16, choices=TIER_CHOICES, default="bronze")
    rating_avg = models.FloatField(default=0)
    rating_count = models.PositiveIntegerField(default=0)
    total_jobs_completed = models.PositiveIntegerField(default=0)
    verified = models.BooleanField(default=False)
    is_suspended = models.BooleanField(default=False)
    suspended_reason = models.TextField(blank=True)
    current_status = models.CharField(
        max_length=16,
        choices=[("available", "Available"), ("busy", "Busy"), ("offline", "Offline")],
        default="offline",
    )
    mpesa_till_or_paybill = models.CharField(max_length=64, blank=True)
    price_min = models.PositiveIntegerField(default=500)
    price_max = models.PositiveIntegerField(default=2500)
    average_response_minutes = models.PositiveIntegerField(default=15)
    next_available_at = models.DateTimeField(null=True, blank=True)


    def __str__(self) -> str:
        return f"{self.user.username} ({self.category})"


class JobRequest(models.Model):
    STATUS_CHOICES = [
        ("pending_provider", "Pending provider"),
        ("accepted", "Accepted"),
        ("in_progress", "In progress"),
        ("completed", "Completed"),
        ("cancelled", "Cancelled"),
    ]
    customer = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="jobs"
    )
    provider = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="assigned_jobs",
    )
    category = models.ForeignKey(ServiceCategory, on_delete=models.PROTECT)
    description = models.TextField()
    location_lat = models.FloatField()
    location_lng = models.FloatField()
    address_text = models.CharField(max_length=255)
    status = models.CharField(
        max_length=32, choices=STATUS_CHOICES, default="pending_provider"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_paid = models.BooleanField(default=False)
    provider_access_otp = models.CharField(max_length=8, blank=True)
    provider_access_token = models.CharField(max_length=64, blank=True)
    ai_match_reason = models.TextField(blank=True)
    client_price_preference = models.CharField(max_length=16, blank=True)
    quoted_price = models.PositiveIntegerField(null=True, blank=True)
    requested_radius_km = models.FloatField(null=True, blank=True)
    pending_since = models.DateTimeField(null=True, blank=True)
    request_sms_sent_at = models.DateTimeField(null=True, blank=True)
    arrival_sms_sent_at = models.DateTimeField(null=True, blank=True)
    expired_at = models.DateTimeField(null=True, blank=True)
    fallback_provider_id = models.IntegerField(null=True, blank=True)


    def __str__(self) -> str:
        return f"{self.category} for {self.customer} ({self.status})"


class Rating(models.Model):
    job = models.OneToOneField(JobRequest, on_delete=models.CASCADE)
    customer = models.ForeignKey(User, on_delete=models.CASCADE)
    provider = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="ratings"
    )
    score = models.PositiveSmallIntegerField()
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class ProviderLocation(models.Model):
    provider = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="locations"
    )
    job = models.ForeignKey(
        JobRequest, on_delete=models.CASCADE, related_name="locations"
    )
    lat = models.FloatField()
    lng = models.FloatField()
    recorded_at = models.DateTimeField(auto_now_add=True)


class ProviderLegalDocument(models.Model):
    profile = models.ForeignKey(
        ServiceProviderProfile,
        on_delete=models.CASCADE,
        related_name="legal_documents",
    )
    title = models.CharField(max_length=128)
    file = models.FileField(upload_to="provider_docs/")
    uploaded_at = models.DateTimeField(auto_now_add=True)


