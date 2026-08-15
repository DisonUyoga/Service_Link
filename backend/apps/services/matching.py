import math
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from .models import JobRequest, ServiceProviderProfile

PRICE_BANDS = {
    "budget": (0, 1200),
    "standard": (1200, 3000),
    "premium": (3000, 1000000),
}

URGENCY_MULTIPLIER = {
    "low": 0.95,
    "normal": 1.0,
    "high": 1.15,
    "emergency": 1.35,
}

SERVICE_COMPLEXITY_KEYWORDS = {
    "leak": 1.15,
    "burst": 1.35,
    "emergency": 1.35,
    "urgent": 1.25,
    "install": 1.2,
    "repair": 1.15,
    "deep": 1.2,
    "blocked": 1.25,
    "wiring": 1.25,
    "diagnostic": 1.1,
}


def distance_km(lat1, lng1, lat2, lng2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _heartbeat_is_fresh(profile) -> bool:
    """True iff ``profile.last_seen_at`` is within the configured TTL."""
    if not getattr(profile, "last_seen_at", None):
        return False
    ttl_min = int(getattr(settings, "PROVIDER_HEARTBEAT_TTL_MIN", 5))
    return profile.last_seen_at >= timezone.now() - timedelta(minutes=ttl_min)


def provider_location(profile):
    """Return the coordinates we should use when ranking ``profile``.

    Prefers the freshest live heartbeat. Falls back to onboarding base
    coordinates only when ``PROVIDER_HEARTBEAT_FALLBACK_TO_BASE`` is on.
    Returns ``(None, None, source)`` when neither is usable.
    """
    if (
        getattr(profile, "current_lat", None) is not None
        and getattr(profile, "current_lng", None) is not None
        and _heartbeat_is_fresh(profile)
    ):
        return profile.current_lat, profile.current_lng, "live"

    if getattr(settings, "PROVIDER_HEARTBEAT_FALLBACK_TO_BASE", False):
        if profile.base_lat is not None and profile.base_lng is not None:
            return profile.base_lat, profile.base_lng, "base_fallback"

    return None, None, "stale"


def price_fit(profile, preference):
    if not preference:
        return 1.0
    lo, hi = PRICE_BANDS.get(preference, (0, 1000000))
    overlap = max(0, min(profile.price_max, hi) - max(profile.price_min, lo))
    span = max(1, profile.price_max - profile.price_min)
    return min(1.0, overlap / span)


def can_offer_wait(profile, category_id):
    if profile.current_status == "available":
        return True, 0
    active = JobRequest.objects.filter(provider=profile.user, status__in=["accepted", "in_progress"]).order_by("updated_at").first()
    if not active:
        return True, profile.average_response_minutes
    if active.category_id != category_id:
        return False, None
    wait = max(profile.average_response_minutes, 20)
    return wait <= 45, wait


def predict_service_price(profile, customer_lat=None, customer_lng=None, description="", price_preference=None, urgency="normal"):
    """
    Rule-based AI price prediction for demo/production MVP.
    Uses provider price range, customer budget band, distance, rating, experience,
    urgency and job complexity words to produce a transparent KES quote.
    """
    price_min = int(profile.price_min or 500)
    price_max = int(profile.price_max or max(price_min, 2500))
    midpoint = (price_min + price_max) / 2

    # Budget preference pushes the quote toward the lower/middle/upper part of provider range.
    if price_preference == "budget":
        base = price_min + (price_max - price_min) * 0.25
    elif price_preference == "premium":
        base = price_min + (price_max - price_min) * 0.72
    else:
        base = midpoint

    distance = 0
    p_lat, p_lng, _ = provider_location(profile)
    if customer_lat is not None and customer_lng is not None and p_lat is not None:
        distance = distance_km(customer_lat, customer_lng, p_lat, p_lng)

    distance_factor = 1 + min(distance, 30) * 0.012
    rating_factor = 1 + max(0, (profile.rating_avg or 0) - 4.0) * 0.035
    experience_factor = 1 + min((profile.total_jobs_completed or 0), 150) / 1500
    availability_factor = 1.0 if profile.current_status == "available" else 0.92

    text = (description or "").lower()
    complexity_factor = 1.0
    matched_keywords = []
    for keyword, factor in SERVICE_COMPLEXITY_KEYWORDS.items():
        if keyword in text:
            complexity_factor = max(complexity_factor, factor)
            matched_keywords.append(keyword)

    urgency_factor = URGENCY_MULTIPLIER.get(urgency or "normal", 1.0)
    raw = base * distance_factor * rating_factor * experience_factor * availability_factor * complexity_factor * urgency_factor
    predicted = int(round(raw / 50.0) * 50)
    predicted = max(price_min, min(predicted, price_max))

    confidence = 0.64
    if profile.rating_count >= 10:
        confidence += 0.12
    if profile.total_jobs_completed >= 30:
        confidence += 0.1
    if price_preference:
        confidence += 0.05
    if distance <= max(profile.service_radius_km, 1):
        confidence += 0.04
    confidence = min(confidence, 0.95)

    reasons = [
        f"provider range KSh {price_min}-{price_max}",
        f"{round(distance, 1)} km distance",
        f"{round(profile.rating_avg or 0, 1)}/5 rating",
        f"{profile.total_jobs_completed} completed jobs",
    ]
    if price_preference:
        reasons.append(f"client selected {price_preference} budget")
    if matched_keywords:
        reasons.append("complexity signals: " + ", ".join(sorted(set(matched_keywords))[:4]))
    if urgency and urgency != "normal":
        reasons.append(f"urgency: {urgency}")

    return {
        "predicted_price": predicted,
        "currency": "KES",
        "confidence": round(confidence, 2),
        "explanation": "AI price predicted from " + "; ".join(reasons) + ".",
    }


def rank_providers(
    lat,
    lng,
    category_id=None,
    price_preference=None,
    include_busy=True,
    description="",
    urgency="normal",
    radius_km=None,
    exclude_user_ids=None,
):
    """Return ranked providers within a customer-defined geofence.

    The geofence is the smaller of:
      - ``radius_km`` (customer/setting cap), and
      - the provider's own ``service_radius_km``.

    ``exclude_user_ids`` lets callers skip providers (used for
    fallback suggestions when the original choice is unresponsive).
    """
    if radius_km is None:
        radius_km = getattr(settings, "GEOFENCE_DEFAULT_RADIUS_KM", 10)
    radius_km = float(radius_km)
    radius_km = min(radius_km, getattr(settings, "GEOFENCE_MAX_RADIUS_KM", 30))

    qs = ServiceProviderProfile.objects.select_related("user", "category").filter(
        verified=True, is_suspended=False
    )
    if category_id:
        qs = qs.filter(category_id=category_id)
    if include_busy:
        qs = qs.filter(current_status__in=["available", "busy"])
    else:
        qs = qs.filter(current_status="available")
    if exclude_user_ids:
        qs = qs.exclude(user_id__in=list(exclude_user_ids))

    ranked = []
    for p in qs:
        # Use the freshest GPS heartbeat, NOT the onboarding base coordinates.
        p_lat, p_lng, source = provider_location(p)
        if p_lat is None:
            # No live heartbeat (and base fallback is disabled) — skip.
            continue
        dist = distance_km(lat, lng, p_lat, p_lng)
        # Enforce both the customer geofence AND the provider's operating radius.
        effective_radius = min(radius_km, max(p.service_radius_km, 1))
        if dist > effective_radius:
            continue
        ok, wait = can_offer_wait(p, category_id or p.category_id)
        if not ok:
            continue
        rating = (p.rating_avg or 0) / 5
        proximity = max(0, 1 - (dist / max(effective_radius, 1)))
        price = price_fit(p, price_preference)
        availability = 1 if p.current_status == "available" else 0.55
        experience = min(1, (p.total_jobs_completed or 0) / 100)
        quote = predict_service_price(p, lat, lng, description, price_preference, urgency)
        # Prefer providers whose predicted quote still sits naturally in the requested budget band.
        quote_fit = 1.0
        if price_preference in PRICE_BANDS:
            lo, hi = PRICE_BANDS[price_preference]
            quote_fit = 1.0 if lo <= quote["predicted_price"] <= hi else 0.75
        score = (availability * .28) + (proximity * .22) + (price * .18) + (quote_fit * .10) + (rating * .13) + (experience * .09)
        p.ai_score = round(score * 100, 1)
        p.wait_minutes = wait
        p.predicted_price = quote["predicted_price"]
        p.price_prediction_confidence = quote["confidence"]
        p.price_prediction_reason = quote["explanation"]
        p.location_source = source
        p.live_lat = p_lat
        p.live_lng = p_lng
        p.live_distance_km = round(dist, 1)
        p.ai_reason = (
            f"AI selected {p.user.username} because they are {round(dist, 1)} km away "
            f"(based on {source} location), status is {p.current_status}, predicted price is "
            f"KSh {quote['predicted_price']} within their KSh {p.price_min}-{p.price_max} range, "
            f"rating is {round(p.rating_avg or 0, 1)}/5, "
            f"and they have completed {p.total_jobs_completed} jobs. {quote['explanation']}"
        )
        ranked.append(p)
    return sorted(ranked, key=lambda p: p.ai_score, reverse=True)
