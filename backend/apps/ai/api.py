from math import radians, sin, cos, sqrt, atan2
import random

from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from apps.services.models import Rating, ServiceCategory, ServiceProviderProfile
from apps.services.matching import provider_location
from .serializers import MatchRequestSerializer, FeedbackSummarySerializer
from .gemini_client import summarize_feedback


User = get_user_model()


def compose_ai_reason(
    *,
    profile,
    distance_km: float,
    predicted_price: float,
    budget_fit: bool,
    priority: str,
) -> str:
    """Build a varied, provider-specific recommendation sentence.

    Same provider always gets the same wording (seeded by id) so the UI
    feels stable, but no two providers in a list read identically.
    """
    rng = random.Random(profile.id)

    rating = round(float(profile.rating_avg or 0), 1)
    review_count = int(profile.rating_count or 0)
    completed = int(profile.total_jobs_completed or 0)
    tier = (profile.tier or "bronze").lower()
    status = (profile.current_status or "").lower()
    response_min = int(getattr(profile, "average_response_minutes", 0) or 0)
    category_name = profile.category.name.lower() if profile.category else "service"

    highlights: list[str] = []

    if rating >= 4.7 and review_count >= 5:
        highlights.append(
            rng.choice([
                f"top-rated at {rating}/5",
                f"highly reviewed ({rating}/5)",
                f"clients consistently rate them {rating}/5",
            ])
        )
    elif rating >= 4.0:
        highlights.append(
            rng.choice([
                f"solid {rating}/5 rating",
                f"steady {rating}/5 from past clients",
            ])
        )

    if review_count >= 30:
        highlights.append(
            rng.choice([
                f"trusted across {review_count}+ Nairobi jobs",
                f"{review_count} reviews on file",
            ])
        )
    elif review_count >= 10:
        highlights.append(f"{review_count} prior reviews")

    if completed >= 50:
        highlights.append(
            rng.choice([
                f"{completed}+ completed jobs",
                "deeply experienced",
            ])
        )
    elif completed >= 20:
        highlights.append(f"completed {completed} jobs already")

    if tier in {"gold", "platinum"}:
        highlights.append(
            rng.choice([
                f"verified {tier.title()} tier",
                f"{tier.title()}-tier specialist",
            ])
        )

    if distance_km < 1.5:
        highlights.append(
            rng.choice([
                f"only {distance_km:.1f} km away",
                "right around the corner",
            ])
        )
    elif distance_km < 5:
        highlights.append(f"a quick {distance_km:.1f} km away")
    else:
        highlights.append(f"{distance_km:.1f} km from you")

    if status == "available":
        highlights.append(
            rng.choice([
                "available now",
                "on standby for new jobs",
                "ready to take your job today",
            ])
        )
    elif status == "busy":
        highlights.append("currently on another job — but worth the wait")

    if response_min and response_min <= 15:
        highlights.append(f"typically responds in ~{response_min} min")

    if budget_fit:
        highlights.append(
            rng.choice([
                "fits your budget",
                "priced inside your range",
                f"estimate KES {int(predicted_price):,} — within budget",
            ])
        )
    else:
        highlights.append(
            rng.choice([
                "slightly above your budget but a strong match",
                f"estimate KES {int(predicted_price):,} (just outside your range)",
            ])
        )

    if priority == "cheapest":
        highlights.append("good value pick")
    elif priority == "fastest":
        highlights.append("close enough to arrive quickly")
    elif priority == "highest_rated":
        highlights.append("matches your quality-first preference")
    elif priority == "experienced":
        highlights.append("matches your experience preference")

    rng.shuffle(highlights)
    chosen = highlights[: rng.choice([2, 2, 3])]

    openers = [
        f"A strong {category_name} match",
        "Recommended for you",
        f"Worth considering for {category_name}",
        "Good fit",
        "Solid pick",
    ]
    opener = rng.choice(openers)

    if len(chosen) == 1:
        return f"{opener} — {chosen[0]}."
    if len(chosen) == 2:
        return f"{opener} — {chosen[0]} and {chosen[1]}."
    return f"{opener}: {chosen[0]}, {chosen[1]}, and {chosen[2]}."


CATEGORY_KEYWORDS = {
    "Cleaning": [
        "cleaning",
        "cleaner",
        "cleaners",
        "house cleaning",
        "deep cleaning",
        "maid",
        "mopping",
        "dusting",
        "sofa cleaning",
    ],
    "Mechanic": [
        "mechanic",
        "car",
        "vehicle",
        "battery",
        "engine",
        "garage",
        "brake",
        "tyre",
        "tire",
    ],
    "Plumbing": [
        "plumbing",
        "plumber",
        "pipe",
        "leak",
        "sink",
        "toilet",
        "drain",
        "tap",
        "water",
    ],
    "Electrical": [
        "electrical",
        "electrician",
        "power",
        "socket",
        "switch",
        "wiring",
        "lights",
        "electric",
    ],
    "Appliance Repair": [
        "appliance",
        "fridge",
        "freezer",
        "washing machine",
        "microwave",
        "cooker",
        "repair",
    ],
    "Salon & Beauty": [
        "salon",
        "beauty",
        "hair",
        "makeup",
        "manicure",
        "pedicure",
        "barber",
    ],
    "Carpentry": [
        "carpentry",
        "carpenter",
        "wood",
        "wardrobe",
        "cabinet",
        "door",
        "furniture",
    ],
    "Pest Control": [
        "pest",
        "fumigation",
        "cockroach",
        "rats",
        "bedbugs",
        "termites",
    ],
    "Painting": [
        "painting",
        "paint",
        "painter",
        "wall paint",
    ],
    "Laundry": [
        "laundry",
        "clothes",
        "washing",
        "dry cleaning",
        "ironing",
    ],
}


def haversine_km(lat1, lng1, lat2, lng2):
    if lat2 is None or lng2 is None:
        return 999999.0

    earth_radius_km = 6371.0

    dlat = radians(lat2 - lat1)
    dlng = radians(lng2 - lng1)

    a = (
        sin(dlat / 2) ** 2
        + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ** 2
    )

    return earth_radius_km * 2 * atan2(sqrt(a), sqrt(1 - a))


def resolve_category(data):
    category_id = data.get("category_id") or data.get("category")

    if category_id:
        category = ServiceCategory.objects.filter(id=category_id).first()
        if category:
            return category

    category_name = (data.get("category_name") or "").strip()
    if category_name:
        category = ServiceCategory.objects.filter(name__iexact=category_name).first()
        if category:
            return category

    description = (data.get("description") or "").strip().lower()

    if not description:
        return None

    exact_category = ServiceCategory.objects.filter(name__iexact=description).first()
    if exact_category:
        return exact_category

    partial_category = ServiceCategory.objects.filter(name__icontains=description).first()
    if partial_category:
        return partial_category

    for category_label, keywords in CATEGORY_KEYWORDS.items():
        if any(keyword in description for keyword in keywords):
            category = ServiceCategory.objects.filter(name__iexact=category_label).first()
            if category:
                return category

    return None


def estimate_price(profile, distance_km, price_preference):
    price_min = getattr(profile, "price_min", None) or 500
    price_max = getattr(profile, "price_max", None) or 3000

    midpoint = (float(price_min) + float(price_max)) / 2

    if price_preference == "budget":
        base = float(price_min) * 1.08
    elif price_preference == "premium":
        base = midpoint * 1.25
    else:
        base = midpoint

    distance_component = min(distance_km * 35, 700)
    rating_component = max(float(profile.rating_avg or 0) - 4.0, 0) * 120
    experience_component = min(float(profile.total_jobs_completed or 0) * 4, 350)

    predicted = base + distance_component + rating_component + experience_component
    predicted = max(float(price_min), min(predicted, float(price_max)))

    return int(round(predicted / 50) * 50)


def provider_score(profile, distance_km, predicted_price):
    rating = float(profile.rating_avg or 0)
    completed_jobs = float(profile.total_jobs_completed or 0)

    availability_score = 40 if profile.current_status == "available" else 10
    distance_score = max(0, 30 - distance_km)
    rating_score = rating * 8
    experience_score = min(completed_jobs / 5, 20)
    price_score = max(0, 20 - (predicted_price / 1000))

    return availability_score + distance_score + rating_score + experience_score + price_score


class AiMatchProvidersView(APIView):
    """
    Strict service-category provider matching.

    Critical production rule:
    1. Resolve the requested category first.
    2. Filter providers by that category.
    3. Only then rank by distance, availability, price and rating.

    This prevents Cleaning from returning Mechanics, Plumbers, etc.
    """

    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = MatchRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        lat = data["lat"]
        lng = data["lng"]
        price_preference = (data.get("price_preference") or "standard").lower()
        budget_min = data.get("budget_min")
        budget_max = data.get("budget_max")
        budget_amount = data.get("budget_amount")
        priority = (data.get("priority") or "balanced").lower()

        if budget_amount and not budget_max:
            budget_max = budget_amount

        category = resolve_category(data)

        if not category:
            return Response(
                {
                    "category": None,
                    "category_name": None,
                    "options": [],
                    "message": "No matching service category was found.",
                }
            )

        # Customer-side geofence cap.
        from django.conf import settings as dj_settings

        max_radius = float(
            getattr(dj_settings, "GEOFENCE_MAX_RADIUS_KM", 30)
        )
        default_radius = float(
            getattr(dj_settings, "GEOFENCE_DEFAULT_RADIUS_KM", 10)
        )
        customer_radius = float(data.get("radius_km") or default_radius)
        customer_radius = min(customer_radius, max_radius)

        exclude_ids = data.get("exclude_user_ids") or []

        queryset = (
            ServiceProviderProfile.objects.select_related("user", "category")
            .filter(
                category=category,
                verified=True,
                is_suspended=False,
            )
            .exclude(current_status="offline")
        )
        if exclude_ids:
            queryset = queryset.exclude(user_id__in=exclude_ids)

        ranked = []
        # Set before the loop — if every provider is filtered out (no live
        # GPS, outside geofence, etc.) we still return a valid JSON payload.
        budget_fit = True

        for profile in queryset:
            # Use the freshest live heartbeat. Skip providers without a fresh
            # GPS reading (and no base fallback configured).
            p_lat, p_lng, location_source = provider_location(profile)
            if p_lat is None:
                continue
            distance_km = haversine_km(lat, lng, p_lat, p_lng)

            service_radius = getattr(profile, "service_radius_km", 25) or 25

            # Effective geofence: smaller of customer cap and provider's own radius.
            effective_radius = min(float(customer_radius), float(service_radius))
            if distance_km > effective_radius:
                continue

            predicted_price = estimate_price(profile, distance_km, price_preference)
            score = provider_score(profile, distance_km, predicted_price)
            budget_fit = True

            if budget_min is not None and predicted_price < float(budget_min):
                budget_fit = False

            if budget_max is not None and predicted_price > float(budget_max):
                budget_fit = False

            if budget_fit:
                score += 25
            else:
                score -= 30

            if priority == "cheapest":
                score += max(0, 30 - (predicted_price / 200))

            elif priority == "fastest":
                score += max(0, 30 - distance_km)

            elif priority == "highest_rated":
                score += float(profile.rating_avg or 0) * 6

            elif priority == "experienced":
                score += min(float(profile.total_jobs_completed or 0) / 3, 30)

            if profile.current_status == "busy":
                score -= 15

            ranked.append(
                {
                    "score": score,
                    "id": profile.id,
                    "user_id": profile.user_id,
                    "user_name": profile.user.get_full_name()
                    or profile.user.username
                    or "Service Provider",
                    "category": profile.category_id,
                    "category_name": profile.category.name,
                    "tier": profile.tier,
                    "rating_avg": round(float(profile.rating_avg or 0), 1),
                    "rating_count": profile.rating_count,
                    "total_jobs_completed": profile.total_jobs_completed,
                    "current_status": profile.current_status,
                    "distance_km": round(distance_km, 1),
                    "location_source": location_source,
                    "last_seen_at": (
                        profile.last_seen_at.isoformat()
                        if profile.last_seen_at
                        else None
                    ),
                    "price_min": getattr(profile, "price_min", None),
                    "price_max": getattr(profile, "price_max", None),
                    "predicted_price": predicted_price,
                    "price_prediction_confidence": "High"
                    if profile.rating_count >= 10
                    else "Medium",
                    "ai_reason": compose_ai_reason(
                        profile=profile,
                        distance_km=distance_km,
                        predicted_price=predicted_price,
                        budget_fit=budget_fit,
                        priority=priority,
                    ),
                }
            )

        ranked.sort(key=lambda item: item["score"], reverse=True)

        return Response(
            {
                "category": category.id,
                "category_name": category.name,
                "options": ranked[:20],
                "budget_fit": budget_fit,
                "client_budget_min": budget_min,
                "client_budget_max": budget_max,
                "priority": priority,
                "radius_km": customer_radius,
            }
        )


class AiFeedbackSummaryView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = FeedbackSummarySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        provider_id = serializer.validated_data["provider_id"]
        provider = get_object_or_404(User, id=provider_id)

        qs = Rating.objects.filter(provider=provider)
        count = qs.count()

        if count == 0:
            return Response(
                {
                    "provider_id": provider_id,
                    "review_count": 0,
                    "summary": "No reviews yet.",
                }
            )

        texts = [rating.comment for rating in qs if rating.comment]
        joined = "\n- ".join(texts)

        if not joined:
            return Response(
                {
                    "provider_id": provider_id,
                    "review_count": count,
                    "summary": "No text reviews yet.",
                }
            )

        summary = summarize_feedback(joined)

        return Response(
            {
                "provider_id": provider_id,
                "review_count": count,
                "summary": summary,
            }
        )

class AiPricePredictionView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        data = request.data

        category = resolve_category(data)
        lat = float(data.get("lat") or -1.286389)
        lng = float(data.get("lng") or 36.817223)
        price_preference = (data.get("price_preference") or "standard").lower()


        if not category:
            return Response(
                {
                    "predicted_price": None,
                    "confidence": "Low",
                    "reason": "No matching service category was found.",
                }
            )

        providers = ServiceProviderProfile.objects.filter(
            category=category,
            verified=True,
            is_suspended=False,
        ).exclude(current_status="offline")

        if not providers.exists():
            return Response(
                {
                    "category": category.id,
                    "category_name": category.name,
                    "predicted_price": None,
                    "confidence": "Low",
                    "reason": f"No available providers found for {category.name}.",
                }
            )

        predictions = []

        for profile in providers:
            distance_km = haversine_km(lat, lng, profile.base_lat, profile.base_lng)
            predictions.append(
                estimate_price(profile, distance_km, price_preference)
            )

        average_price = int(round((sum(predictions) / len(predictions)) / 50) * 50)

        return Response(
            {
                "category": category.id,
                "category_name": category.name,
                "predicted_price": average_price,
                "confidence": "High" if len(predictions) >= 5 else "Medium",
                "reason": (
                    f"Estimated from {len(predictions)} nearby {category.name} "
                    f"provider price ranges, distance and rating data."
                ),
            }
        )