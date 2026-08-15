"""High-level SMS notifications for the S-Link job lifecycle.

Each helper takes a job (or job + extra context) and sends the relevant
message to either the customer or the provider, then stamps the job
with a timestamp so we never double-send the same SMS.
"""

from __future__ import annotations

import logging

from django.utils import timezone

from apps.notifications.sms import send_sms

from .matching import distance_km, provider_location, rank_providers

logger = logging.getLogger("s_link.services")


def _provider_name(profile) -> str:
    user = getattr(profile, "user", None)
    if user is None:
        return "Service Provider"
    return user.get_full_name() or user.username


def _issue_snippet(description: str, *, max_len: int = 60) -> str:
    """First line of the customer's issue, trimmed for SMS length."""
    text = " ".join((description or "").split())
    if not text:
        return ""
    if len(text) <= max_len:
        return text
    return text[: max_len - 1].rstrip() + "…"


def notify_provider_of_job(job) -> None:
    """SMS to provider that they have a new job to accept/decline."""
    if not job.provider_id:
        logger.warning(
            "Provider SMS skipped: job=%s has no provider assigned.", job.id
        )
        return

    provider = job.provider
    phone = getattr(provider, "phone_number", "") or ""
    if not phone:
        logger.warning(
            "Provider SMS skipped: job=%s provider=%s (%s) has NO phone number "
            "on file. Provider will only see the job in-app, not via SMS.",
            job.id,
            provider.id,
            provider.username,
        )
        return

    logger.info(
        "Provider SMS dispatching: job=%s provider=%s (%s) phone=%s",
        job.id,
        provider.id,
        provider.username,
        phone,
    )

    customer_name = job.customer.get_full_name() or job.customer.username
    service = getattr(job.category, "name", "service")
    quote = f"KES {job.quoted_price}" if job.quoted_price else "TBD"
    issue = _issue_snippet(job.description or "")

    message = (
        f"S-Link: {customer_name} requested your {service} service "
        f"at {job.address_text or 'a customer location'}. "
    )
    if issue:
        message += f"Issue: {issue}. "
    message += (
        f"Quote {quote}. OTP {job.provider_access_otp}. "
        f"Open the S-Link app to accept within a few minutes."
    )

    send_sms(phone, message)
    job.request_sms_sent_at = timezone.now()
    if not job.pending_since:
        job.pending_since = timezone.now()
    job.save(update_fields=["request_sms_sent_at", "pending_since"])


def notify_customer_arrival(job, *, provider_lat, provider_lng, threshold_m=500) -> bool:
    """If provider is within ``threshold_m`` of customer, SMS the customer.

    Returns True when a fresh SMS was actually sent.
    """
    if job.arrival_sms_sent_at:
        return False
    if job.location_lat is None or job.location_lng is None:
        return False

    metres = distance_km(
        job.location_lat,
        job.location_lng,
        provider_lat,
        provider_lng,
    ) * 1000
    if metres > threshold_m:
        return False

    customer = job.customer
    phone = getattr(customer, "phone_number", "") or ""
    if not phone:
        return False

    provider = job.provider
    provider_name = (
        provider.get_full_name() or provider.username if provider else "Your provider"
    )

    message = (
        f"S-Link: {provider_name} is about {int(metres)}m away "
        f"and will arrive shortly. Please get ready to receive them."
    )

    send_sms(phone, message)
    job.arrival_sms_sent_at = timezone.now()
    job.save(update_fields=["arrival_sms_sent_at"])
    return True


def notify_customer_provider_unavailable(job, *, alternative=None) -> None:
    """SMS the customer that their chosen provider didn't respond,
    and offer the next-best alternative.
    """
    customer = job.customer
    phone = getattr(customer, "phone_number", "") or ""
    if not phone:
        return

    original = job.provider
    original_name = (
        original.get_full_name() or original.username if original else "Your provider"
    )

    if alternative is None:
        message = (
            f"S-Link: {original_name} could not respond in time. "
            "Please reopen the app and pick a different provider."
        )
    else:
        alt_name = _provider_name(alternative)
        alt_distance = getattr(alternative, "_distance_km", None)
        alt_price = getattr(alternative, "predicted_price", None)
        bits = [f"S-Link: {original_name} did not respond in time."]
        bits.append(f"Try {alt_name}")
        if alt_distance is not None:
            bits.append(f"({round(alt_distance, 1)} km away)")
        if alt_price is not None:
            bits.append(f"~ KES {alt_price}")
        bits.append("- open the app to switch providers.")
        message = " ".join(bits)

    send_sms(phone, message)


def find_alternative_provider(job):
    """Return the next-best provider for ``job`` excluding the current one."""
    if job.location_lat is None or job.location_lng is None:
        return None

    exclude = {job.provider_id} if job.provider_id else set()
    if job.fallback_provider_id:
        # Don't suggest the same fallback twice.
        exclude.add(job.fallback_provider_id)

    ranked = rank_providers(
        lat=job.location_lat,
        lng=job.location_lng,
        category_id=job.category_id,
        radius_km=job.requested_radius_km,
        exclude_user_ids=list(exclude),
        description=job.description or "",
    )
    if not ranked:
        return None
    top = ranked[0]
    # Use the same live coords the matcher just considered.
    p_lat, p_lng, _ = provider_location(top)
    if p_lat is not None:
        top._distance_km = distance_km(
            job.location_lat,
            job.location_lng,
            p_lat,
            p_lng,
        )
    return top
