import logging
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db.models import Avg, Count, Q
from rest_framework import generics, permissions, status, viewsets
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils.crypto import get_random_string
from django.shortcuts import render
from django.utils import timezone

from .models import (
    ServiceCategory,
    ServiceProviderProfile,
    JobRequest,
    Rating,
    ProviderLocation,
    ProviderLegalDocument,
)
from .serializers import (
    ServiceCategorySerializer,
    ProviderListSerializer,
    JobRequestSerializer,
    RatingSerializer,
    ProviderAnalyticsSerializer,
    ProviderLegalDocumentSerializer,
)
from .onboarding_serializers import ProviderOnboardingSerializer
from .matching import rank_providers, predict_service_price
from .notifications import (
    notify_provider_of_job,
    notify_customer_arrival,
    notify_customer_provider_unavailable,
    find_alternative_provider,
)
from django.conf import settings


logger = logging.getLogger("s_link.services")
User = get_user_model()


def _dispatch_provider_sms_async(job) -> None:
    """Send the provider's new-job SMS off the request thread.

    The Dayliff SMS HTTP call can take several seconds (and up to a 30s
    timeout on failure). Doing it inline blocks the customer's create-job
    response, which feels like a freeze. We fire it on a daemon thread so
    the API responds immediately while the SMS still goes out.
    """
    import threading

    job_id = job.id

    def _worker():
        try:
            fresh = JobRequest.objects.get(id=job_id)
            notify_provider_of_job(fresh)
        except Exception:  # noqa: BLE001 - never let SMS failures crash anything
            logger.exception("Async provider SMS failed for job=%s", job_id)

    threading.Thread(target=_worker, daemon=True).start()


def _recalculate_provider_stats(provider: User) -> None:
    """Update rating, job counters and tier for a provider."""
    try:
        profile = ServiceProviderProfile.objects.get(user=provider)
    except ServiceProviderProfile.DoesNotExist:
        return

    agg = Rating.objects.filter(provider=provider).aggregate(
        avg=Avg("score"), cnt=Count("id")
    )
    profile.rating_avg = agg["avg"] or 0
    profile.rating_count = agg["cnt"] or 0
    profile.total_jobs_completed = JobRequest.objects.filter(
        provider=provider, status="completed"
    ).count()

    # Simple tiering rules
    avg = profile.rating_avg
    jobs = profile.total_jobs_completed
    tier = "bronze"
    if jobs >= 150 and avg >= 4.8:
        tier = "platinum"
    elif jobs >= 60 and avg >= 4.5:
        tier = "gold"
    elif jobs >= 20 and avg >= 4.2:
        tier = "silver"
    profile.tier = tier
    profile.save(update_fields=["rating_avg", "rating_count", "total_jobs_completed", "tier"])


class CategoryListView(generics.ListAPIView):
    queryset = ServiceCategory.objects.all()
    serializer_class = ServiceCategorySerializer
    permission_classes = [permissions.AllowAny]


class NearbyProvidersView(generics.ListAPIView):
    serializer_class = ProviderListSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        lat = float(self.request.query_params["lat"])
        lng = float(self.request.query_params["lng"])
        category_id = self.request.query_params.get("category")
        price_preference = self.request.query_params.get("price_preference")
        radius_km = self.request.query_params.get("radius_km")
        category_id = int(category_id) if category_id else None
        radius_km = float(radius_km) if radius_km else None
        return rank_providers(
            lat=lat,
            lng=lng,
            category_id=category_id,
            price_preference=price_preference,
            include_busy=True,
            description=self.request.query_params.get("description", ""),
            radius_km=radius_km,
        )


class ProviderOnboardingView(generics.RetrieveUpdateAPIView):
    """Standard onboarding/update for the authenticated provider only."""

    serializer_class = ProviderOnboardingSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        if getattr(self.request.user, "role", "") != "provider":
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only providers can access provider onboarding.")

        first_category = ServiceCategory.objects.order_by("id").first()

        profile, _ = ServiceProviderProfile.objects.get_or_create(
            user=self.request.user,
            defaults={"category": first_category},
        )

        return profile


class JobViewSet(viewsets.ModelViewSet):
    serializer_class = JobRequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if getattr(user, "role", "customer") == "provider":
            return JobRequest.objects.filter(provider=user)
        return JobRequest.objects.filter(customer=user)

    def perform_create(self, serializer):
        # Customer confirms a selected provider. We generate a secure OTP/token
        # so the provider can access only this session from SMS/email links.
        radius_km = self.request.data.get("radius_km")
        try:
            radius_value = float(radius_km) if radius_km is not None else None
        except (TypeError, ValueError):
            radius_value = None

        job = serializer.save(
            customer=self.request.user,
            provider_access_otp=get_random_string(6, allowed_chars="0123456789"),
            provider_access_token=get_random_string(48),
            requested_radius_km=radius_value,
            pending_since=timezone.now(),
        )

        # Feature flag — when the connection fee is disabled, every new job
        # is treated as paid so the customer can use it immediately.
        fee_enabled = getattr(settings, "CONNECTION_FEE_ENABLED", False)
        if not fee_enabled and not job.is_paid:
            job.is_paid = True
            job.save(update_fields=["is_paid"])

        # If the customer paid the discovery / connection fee already, link the
        # paid session to this job and auto-mark it as paid so the per-job
        # M-Pesa card never appears.
        discovery_id = self.request.data.get("discovery_payment_id")
        if discovery_id:
            try:
                from apps.payments.models import DiscoveryPayment

                discovery = DiscoveryPayment.objects.filter(
                    id=int(discovery_id),
                    customer=self.request.user,
                    status="success",
                    consumed_job__isnull=True,
                ).first()
                if discovery is not None:
                    discovery.consumed_job = job
                    discovery.consumed_at = timezone.now()
                    discovery.save(update_fields=["consumed_job", "consumed_at"])
                    job.is_paid = True
                    job.save(update_fields=["is_paid"])
            except (TypeError, ValueError):
                pass

        if job.provider_id:
            try:
                profile = ServiceProviderProfile.objects.get(user=job.provider)
                quote = predict_service_price(
                    profile,
                    customer_lat=job.location_lat,
                    customer_lng=job.location_lng,
                    description=job.description,
                    price_preference=job.client_price_preference or None,
                    urgency=self.request.data.get("urgency", "normal"),
                )
                job.quoted_price = job.quoted_price or quote["predicted_price"]
                job.ai_match_reason = job.ai_match_reason or (
                    f"AI matched this provider using availability={profile.current_status}, "
                    f"predicted quote=KSh {quote['predicted_price']}, "
                    f"price range=KSh {profile.price_min}-{profile.price_max}, "
                    f"rating={round(profile.rating_avg or 0, 1)}, proximity to the customer, "
                    f"and confidence={quote['confidence']}. {quote['explanation']}"
                )
                job.save(update_fields=["quoted_price", "ai_match_reason"])
                logger.info(
                    "Provider session link job=%s token=%s otp=%s",
                    job.id,
                    job.provider_access_token,
                    job.provider_access_otp,
                )
            except ServiceProviderProfile.DoesNotExist:
                pass

            # SMS the chosen provider that they have a new job to accept.
            # Run in a background thread so the slow Dayliff HTTP call (up to a
            # 30s timeout) never delays the customer's create-job response.
            _dispatch_provider_sms_async(job)

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def accept(self, request, pk=None):
        job = self.get_object()
        provider = request.user

        if getattr(provider, "role", "") != "provider":
            return Response({"detail": "Only providers can accept jobs."}, status=status.HTTP_403_FORBIDDEN)

        if job.status != "pending_provider":
            return Response({"detail": "Job not available."}, status=status.HTTP_400_BAD_REQUEST)
        if job.provider_id and job.provider_id != provider.id:
            return Response({"detail": "This job is reserved for another provider."}, status=status.HTTP_403_FORBIDDEN)

        # Prevent suspended providers from accepting new jobs.
        try:
            profile = ServiceProviderProfile.objects.get(user=provider)
            if profile.is_suspended:
                return Response(
                    {"detail": "Account suspended. You cannot accept new jobs."},
                    status=status.HTTP_403_FORBIDDEN,
                )
        except ServiceProviderProfile.DoesNotExist:
            pass

        has_open = JobRequest.objects.filter(
            provider=provider, status__in=["accepted", "in_progress"]
        ).exists()
        if has_open:
            return Response(
                {"detail": "Finish your current job before accepting a new one."},
                status=status.HTTP_409_CONFLICT,
            )

        job.provider = provider
        job.status = "accepted"
        job.save(update_fields=["provider", "status"])
        ServiceProviderProfile.objects.filter(user=provider).update(current_status="busy")
        return Response({"detail": "Job accepted, awaiting payment."})

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def mark_paid(self, request, pk=None):
        """Mark that payment (e.g. M-Pesa STK) has succeeded."""
        job = self.get_object()
        if job.status != "accepted":
            return Response({"detail": "Job must be accepted first."}, status=status.HTTP_400_BAD_REQUEST)
        job.is_paid = True
        job.status = "in_progress"
        job.save(update_fields=["is_paid", "status"])
        return Response({"detail": "Payment recorded, job in progress."})

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def complete(self, request, pk=None):
        job = self.get_object()

        if request.user != job.provider and request.user != job.customer:
            return Response(
                {"detail": "Only the assigned provider or customer can complete this job."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if job.status not in ["accepted", "in_progress"]:
            return Response(
                {"detail": "Job must be active to complete."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        job.status = "completed"
        job.save(update_fields=["status"])

        if job.provider_id:
            ServiceProviderProfile.objects.filter(user=job.provider).update(
                current_status="available"
            )

        if job.provider:
            _recalculate_provider_stats(job.provider)

        return Response({"detail": "Job marked as completed."})

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def update_location(self, request, pk=None):
        """Provider updates their current location for this job."""
        job = self.get_object()
        if request.user != job.provider:
            return Response({"detail": "Only assigned provider can update location."}, status=status.HTTP_403_FORBIDDEN)
        if job.status not in ["accepted", "in_progress"]:
            return Response({"detail": "Location updates allowed only for active jobs."}, status=status.HTTP_400_BAD_REQUEST)
        lat = float(request.data.get("lat"))
        lng = float(request.data.get("lng"))
        ProviderLocation.objects.create(
            provider=request.user,
            job=job,
            lat=lat,
            lng=lng,
        )

        # Mirror this update onto the provider profile so the matcher /
        # admin monitor can rely on a single source of truth for "current"
        # location, regardless of whether a job is in progress.
        ServiceProviderProfile.objects.filter(user=request.user).update(
            current_lat=lat,
            current_lng=lng,
            last_seen_at=timezone.now(),
        )

        # Trigger arrival SMS once the provider crosses the geofence threshold.
        threshold = float(getattr(settings, "ARRIVAL_NOTIFICATION_METERS", 500))
        arrival_sent = notify_customer_arrival(
            job,
            provider_lat=lat,
            provider_lng=lng,
            threshold_m=threshold,
        )

        return Response({
            "detail": "Location updated.",
            "arrival_sms_sent": arrival_sent,
        })

    @action(detail=True, methods=["get"], permission_classes=[permissions.IsAuthenticated])
    def location(self, request, pk=None):
        """Return latest location for this job (for customer/admin)."""
        job = self.get_object()
        loc = job.locations.order_by("-recorded_at").first()
        if not loc:
            return Response({"latest": None})
        return Response(
            {
                "latest": {
                    "lat": loc.lat,
                    "lng": loc.lng,
                    "recorded_at": loc.recorded_at,
                }
            }
        )
    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def decline(self, request, pk=None):
        job = self.get_object()
        provider = request.user

        if getattr(provider, "role", "") != "provider":
            return Response(
                {"detail": "Only providers can decline jobs."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if job.status != "pending_provider":
            return Response(
                {"detail": "Only pending jobs can be declined."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if job.provider_id and job.provider_id != provider.id:
            return Response(
                {"detail": "This job is reserved for another provider."},
                status=status.HTTP_403_FORBIDDEN,
            )

        alternative = find_alternative_provider(job)
        if alternative:
            job.fallback_provider_id = alternative.user_id
        job.status = "cancelled"
        job.expired_at = timezone.now()
        job.save(update_fields=["status", "expired_at", "fallback_provider_id"])
        notify_customer_provider_unavailable(job, alternative=alternative)

        return Response({
            "detail": "Job declined.",
            "fallback_provider_id": job.fallback_provider_id,
        })
    @action(
        detail=False,
        methods=["post", "get"],
        url_path="expire-pending",
        permission_classes=[permissions.IsAuthenticated],
    )
    def expire_pending(self, request):
        """Auto-expire pending jobs whose provider has not responded in time.

        For each expired job:
          - status becomes ``cancelled`` and ``expired_at`` is stamped
          - a fallback provider (if any) is suggested via SMS to the customer

        This is safe to call from a periodic task or from the customer's
        Jobs screen as a passive sweep.
        """
        timeout_min = int(getattr(settings, "PROVIDER_RESPONSE_TIMEOUT_MIN", 5))
        cutoff = timezone.now() - timedelta(minutes=timeout_min)

        candidates = JobRequest.objects.filter(
            status="pending_provider",
            pending_since__isnull=False,
            pending_since__lt=cutoff,
        ).select_related("customer", "provider", "category")

        expired = []
        for job in candidates:
            alternative = find_alternative_provider(job)
            if alternative:
                job.fallback_provider_id = alternative.user_id
            job.status = "cancelled"
            job.expired_at = timezone.now()
            job.save(update_fields=["status", "expired_at", "fallback_provider_id"])
            notify_customer_provider_unavailable(job, alternative=alternative)
            expired.append({
                "job_id": job.id,
                "fallback_provider_id": job.fallback_provider_id,
            })

        return Response({"expired": expired, "count": len(expired)})

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def start_trip(self, request, pk=None):
        job = self.get_object()

        if getattr(request.user, "role", "") != "provider":
            return Response(
                {"detail": "Only providers can start tracking."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if request.user != job.provider:
            return Response(
                {"detail": "Only the assigned provider can start this trip."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if job.status not in ["accepted", "in_progress"]:
            return Response(
                {"detail": "Only accepted jobs can start live tracking."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if job.status == "accepted":
            job.status = "in_progress"
            job.save(update_fields=["status"])

        ServiceProviderProfile.objects.filter(user=request.user).update(
            current_status="busy"
        )

        return Response({"detail": "Live tracking started."})


class ServiceAutocompleteView(generics.GenericAPIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, *args, **kwargs):
        q = (request.query_params.get("q") or "").strip()
        if not q:
            return Response([])

        suggestions = []
        seen = set()

        def add(value):
            value = (value or "").strip()
            key = value.lower()
            if value and key not in seen and len(suggestions) < 10:
                seen.add(key)
                suggestions.append(value)

        # Service names are the primary autocomplete source.
        for name in ServiceCategory.objects.filter(name__icontains=q).order_by("name").values_list("name", flat=True)[:8]:
            add(name)

        # Provider category/name matches make the search feel alive even when
        # the user types a person-like term or a related word.
        provider_matches = (
            ServiceProviderProfile.objects.select_related("user", "category")
            .filter(
                Q(category__name__icontains=q)
                | Q(user__first_name__icontains=q)
                | Q(user__last_name__icontains=q)
                | Q(user__username__icontains=q)
                | Q(bio__icontains=q)
            )
            .order_by("-verified", "-rating_avg", "average_response_minutes")[:8]
        )
        for profile in provider_matches:
            add(profile.category.name)
            full_name = profile.user.get_full_name() or profile.user.username
            add(f"{profile.category.name} - {full_name}")

        # Keep backward compatibility with the Flutter client by returning a
        # simple string list, not a nested object.
        return Response(suggestions[:10])


class ProviderSessionAccessView(generics.RetrieveAPIView):
    serializer_class = JobRequestSerializer
    permission_classes = [permissions.AllowAny]

    def get_object(self):
        token = self.kwargs["token"]
        otp = self.request.query_params.get("otp", "")
        return JobRequest.objects.get(provider_access_token=token, provider_access_otp=otp)


class RatingViewSet(viewsets.ModelViewSet):
    serializer_class = RatingSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user

        if getattr(user, "role", "") == "provider":
            return Rating.objects.filter(provider=user).order_by("-created_at")

        return Rating.objects.filter(customer=user).order_by("-created_at")

    def perform_create(self, serializer):
        job = serializer.validated_data["job"]
        provider = job.provider

        rating = serializer.save(
            customer=self.request.user,
            provider=provider,
        )

        if rating.provider:
            _recalculate_provider_stats(rating.provider)


class ProviderAnalyticsView(generics.RetrieveAPIView):
    """Analytics for a given provider (for admin)."""

    queryset = ServiceProviderProfile.objects.select_related("user")
    serializer_class = ProviderAnalyticsSerializer
    permission_classes = [permissions.IsAuthenticated]


class MyProviderAnalyticsView(generics.RetrieveAPIView):
    """Analytics for the logged-in provider."""

    serializer_class = ProviderAnalyticsSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return ServiceProviderProfile.objects.get(user=self.request.user)


class ProviderListAdminView(generics.ListAPIView):
    """List all providers with analytics (admin only)."""

    queryset = ServiceProviderProfile.objects.select_related("user")
    serializer_class = ProviderAnalyticsSerializer
    permission_classes = [permissions.IsAdminUser]


class ProviderLegalDocumentUploadView(generics.ListCreateAPIView):
    """List and upload legal documents for the authenticated provider."""

    serializer_class = ProviderLegalDocumentSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get_queryset(self):
        if getattr(self.request.user, "role", "") != "provider":
            return ProviderLegalDocument.objects.none()

        try:
            profile = ServiceProviderProfile.objects.get(user=self.request.user)
        except ServiceProviderProfile.DoesNotExist:
            return ProviderLegalDocument.objects.none()

        return ProviderLegalDocument.objects.filter(profile=profile).order_by(
            "-uploaded_at"
        )

    def perform_create(self, serializer):
        if getattr(self.request.user, "role", "") != "provider":
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only providers can upload documents.")

        profile = ServiceProviderProfile.objects.get(user=self.request.user)

        uploaded_file = self.request.FILES.get("file")

        if uploaded_file and uploaded_file.size > 10 * 1024 * 1024:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({
                "file": "File too large. Maximum allowed size is 10MB."
            })

        serializer.save(profile=profile)




class ProviderHeartbeatView(generics.GenericAPIView):
    """Provider posts their live GPS location here every few seconds.

    The freshest value is stored on ``ServiceProviderProfile.current_lat /
    current_lng / last_seen_at`` and is what the matcher reads when a
    customer searches for nearby providers — onboarding ``base_lat /
    base_lng`` is only used as a (configurable) fallback.

    Optionally also reports their on-shift status so they appear / disappear
    from the matcher when they go online or offline.

    POST /api/services/providers/me/heartbeat/
    {
        "lat": -1.286,
        "lng": 36.817,
        "status": "available"   // optional: available | busy | offline
    }
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        if getattr(request.user, "role", "") != "provider":
            return Response(
                {"detail": "Only providers can post heartbeats."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            lat = float(request.data.get("lat"))
            lng = float(request.data.get("lng"))
        except (TypeError, ValueError):
            return Response(
                {"detail": "lat and lng are required floats."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            profile = ServiceProviderProfile.objects.get(user=request.user)
        except ServiceProviderProfile.DoesNotExist:
            return Response(
                {"detail": "Complete provider onboarding first."},
                status=status.HTTP_404_NOT_FOUND,
            )

        update_fields = {
            "current_lat": lat,
            "current_lng": lng,
            "last_seen_at": timezone.now(),
        }

        new_status = (request.data.get("status") or "").strip().lower()
        if new_status in {"available", "busy", "offline"}:
            update_fields["current_status"] = new_status

        ServiceProviderProfile.objects.filter(pk=profile.pk).update(**update_fields)

        # If there's an active job, also append a ProviderLocation row so
        # the customer's live tracker sees this update without the provider
        # having to call /jobs/<id>/update_location/ separately.
        active_job = JobRequest.objects.filter(
            provider=request.user,
            status__in=["accepted", "in_progress"],
        ).order_by("-updated_at").first()
        arrival_sms_sent = False
        if active_job:
            ProviderLocation.objects.create(
                provider=request.user,
                job=active_job,
                lat=lat,
                lng=lng,
            )
            threshold = float(getattr(settings, "ARRIVAL_NOTIFICATION_METERS", 500))
            arrival_sms_sent = notify_customer_arrival(
                active_job,
                provider_lat=lat,
                provider_lng=lng,
                threshold_m=threshold,
            )

        logger.info(
            "HEARTBEAT provider=%s (id=%s) cat=%s status=%s lat=%.6f lng=%.6f "
            "active_job=%s arrival_sms=%s",
            request.user.username,
            request.user.id,
            getattr(profile.category, "name", "-"),
            update_fields.get("current_status", profile.current_status),
            lat,
            lng,
            active_job.id if active_job else "-",
            arrival_sms_sent,
        )

        return Response({
            "detail": "Heartbeat received.",
            "current_lat": lat,
            "current_lng": lng,
            "last_seen_at": update_fields["last_seen_at"].isoformat(),
            "active_job_id": active_job.id if active_job else None,
            "arrival_sms_sent": arrival_sms_sent,
        })


class ProviderHeartbeatStatusView(generics.GenericAPIView):
    """Return the most recent heartbeat the backend has stored for this
    provider. Useful for the provider's own dashboard / debugging UI so
    they can confirm their location really is being broadcast.

    GET /api/services/providers/me/heartbeat/
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        if getattr(request.user, "role", "") != "provider":
            return Response(
                {"detail": "Only providers can view heartbeats."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            profile = ServiceProviderProfile.objects.select_related("category").get(
                user=request.user
            )
        except ServiceProviderProfile.DoesNotExist:
            return Response(
                {"detail": "Complete provider onboarding first."},
                status=status.HTTP_404_NOT_FOUND,
            )

        ttl_min = int(getattr(settings, "PROVIDER_HEARTBEAT_TTL_MIN", 5))
        last_seen = profile.last_seen_at
        seconds_ago = None
        is_live = False
        if last_seen:
            seconds_ago = int((timezone.now() - last_seen).total_seconds())
            is_live = seconds_ago <= ttl_min * 60

        recent = list(
            ProviderLocation.objects.filter(provider=request.user)
            .order_by("-recorded_at")[:10]
            .values("lat", "lng", "recorded_at", "job_id")
        )

        return Response({
            "username": request.user.username,
            "category": getattr(profile.category, "name", None),
            "current_status": profile.current_status,
            "current_lat": profile.current_lat,
            "current_lng": profile.current_lng,
            "last_seen_at": last_seen.isoformat() if last_seen else None,
            "seconds_since_last_heartbeat": seconds_ago,
            "is_live": is_live,
            "ttl_minutes": ttl_min,
            "recent_job_locations": recent,
        })


def admin_provider_monitor_page(request):
    """Live admin dashboard page for monitoring provider/driver positions.

    NOTE: kept publicly reachable on purpose so the ops dashboard can be
    pulled up on any device without an admin login. Lock this down with
    ``@staff_member_required`` again before exposing the backend to the
    public internet.
    """
    return render(request, "services/admin_provider_monitor.html")


class AdminProviderLiveLocationsView(generics.GenericAPIView):
    """Return the latest known location for each provider/driver.

    SECURITY: this endpoint is intentionally open (``AllowAny``) so the
    live monitor dashboard can be opened without an admin login during
    operations / demos. Returns every non-suspended provider, including
    unverified ones, so admins can see new signups on the map and verify
    them. Restrict to ``IsAdminUser`` again before going to production
    on a public domain.
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request, *args, **kwargs):
        # Only show providers whose last GPS signal (heartbeat OR per-job
        # location update) arrived within this many minutes. Default 10
        # min — overridable via env or ?stale_after=N for one-off views.
        default_stale = int(getattr(settings, "ADMIN_MONITOR_STALE_AFTER_MIN", 10))
        try:
            stale_after_min = int(request.query_params.get("stale_after") or default_stale)
        except (TypeError, ValueError):
            stale_after_min = default_stale
        cutoff = timezone.now() - timedelta(minutes=stale_after_min)

        providers = ServiceProviderProfile.objects.select_related("user", "category").filter(
            is_suspended=False,
        ).order_by("category__name", "user__first_name", "user__username")

        items = []
        excluded_stale = 0
        for profile in providers:
            latest = ProviderLocation.objects.filter(provider=profile.user).select_related("job", "job__customer").order_by("-recorded_at").first()
            active_job = JobRequest.objects.filter(
                provider=profile.user,
                status__in=["accepted", "in_progress"],
            ).select_related("customer", "category").order_by("-updated_at").first()

            # Pick the freshest available signal.
            if latest and latest.recorded_at >= cutoff:
                lat = latest.lat
                lng = latest.lng
                last_seen = latest.recorded_at
                source = "active_job"
            elif (
                profile.current_lat is not None
                and profile.current_lng is not None
                and profile.last_seen_at
                and profile.last_seen_at >= cutoff
            ):
                lat = profile.current_lat
                lng = profile.current_lng
                last_seen = profile.last_seen_at
                source = "heartbeat"
            else:
                # No fresh GPS in the last `stale_after_min` minutes — hide
                # them from the live map AND treat them as offline so the
                # sidebar counters don't claim phantom busy/available
                # providers.
                excluded_stale += 1
                continue

            minutes_since_seen = int((timezone.now() - last_seen).total_seconds() // 60)

            # Reflect actual presence: a stale "busy" status from the DB
            # does NOT mean someone is on a job right now, so we trust the
            # active_job presence over `current_status`.
            if active_job:
                effective_status = "busy"
            elif profile.current_status == "offline":
                effective_status = "offline"
            else:
                effective_status = profile.current_status or "available"

            job = active_job or (latest.job if latest else None)
            items.append({
                "provider_id": profile.user_id,
                "profile_id": profile.id,
                "name": profile.user.get_full_name() or profile.user.username,
                "username": profile.user.username,
                "category": profile.category.name if profile.category_id else "Unassigned",
                "status": effective_status,
                "tier": profile.tier,
                "rating_avg": round(profile.rating_avg or 0, 1),
                "verified": profile.verified,
                "lat": lat,
                "lng": lng,
                "last_seen": last_seen.isoformat() if last_seen else None,
                "minutes_since_seen": minutes_since_seen,
                "location_source": source,
                "active_job": {
                    "id": job.id,
                    "status": job.status,
                    "customer": job.customer.get_full_name() or job.customer.username,
                    "address": job.address_text,
                    "service": job.category.name,
                    "quoted_price": job.quoted_price,
                } if job else None,
            })

        return Response({
            "generated_at": timezone.now().isoformat(),
            "count": len(items),
            "stale_after_min": stale_after_min,
            "excluded_stale": excluded_stale,
            "providers": items,
        })
