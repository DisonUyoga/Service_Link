"""Dayliff Bridge SMS client — aligned with the Laravel sendRawSMS integration.

Configured via Django settings (same env names as the PHP ``.env``):

- ``SMS_URL`` — defaults to https://bridge.dayliff.com/v1/SMS/sendRawSMS
- ``SMS_API_KEY`` — sent as the ``D-Api-Key`` request header
- ``SMS_COUNTRY`` — defaults to ``KENYA`` (required by sendRawSMS body)
- ``SMS_DRY_RUN`` — when ``true``, messages are logged instead of being sent.
"""

from __future__ import annotations

import logging
from typing import Iterable

import requests
from django.conf import settings


logger = logging.getLogger("s_link.sms")


def _normalize(msisdn: str) -> str:
    """Normalise Kenyan MSISDNs to ``+2547XXXXXXXX`` (matches Laravel validatePhone)."""
    if not msisdn:
        return ""

    # Keep digits and leading + only.
    raw = "".join(c for c in msisdn.strip() if c.isdigit() or c == "+")
    if not raw:
        return ""

    # Already +2547XXXXXXXX (13 chars)
    if raw.startswith("+254") and len(raw) == 13:
        return raw

    # 2547XXXXXXXX (12 digits) → +254...
    if raw.startswith("254") and len(raw) == 12:
        return f"+{raw}"

    # 07XXXXXXXX or 0XXXXXXXX → +2547...
    if raw.startswith("0"):
        stripped = raw.lstrip("0")
        if len(stripped) == 9 and stripped.startswith("7"):
            return f"+254{stripped}"
        candidate = f"+254{stripped}"
        if len(candidate) == 13:
            return candidate

    # 7XXXXXXXX (9 digits)
    if len(raw) == 9 and raw.startswith("7"):
        return f"+254{raw}"

    # Bare digits without country code but long enough
    if raw.startswith("254") and len(raw) >= 12:
        return f"+{raw[:12]}"

    return ""


def send_sms(to: str, message: str, *, country: str | None = None) -> dict:
    """Send a single SMS via Dayliff Bridge ``sendRawSMS``.

    Mirrors the Laravel ``sendSMS()`` contract:

    - POST JSON ``{ content, phoneNumber, country }``
    - Header ``D-Api-Key: <SMS_API_KEY>``

    Returns a dict with at least ``ok`` (bool). Network/HTTP failures are
    caught and logged so job flows are not aborted by a transient SMS outage.
    """
    phone = _normalize(to)

    if not phone:
        logger.warning("SMS skipped: invalid phone %r for message=%r", to, message)
        return {"ok": False, "reason": "invalid-phone"}

    api_key = getattr(settings, "SMS_API_KEY", "") or ""
    if not api_key:
        logger.error("SMS not sent: missing SMS_API_KEY for phone=%s", phone)
        return {"ok": False, "reason": "missing-api-key"}

    if getattr(settings, "SMS_DRY_RUN", False):
        logger.info("[SMS DRY-RUN] to=%s msg=%r", phone, message)
        return {"ok": True, "dry_run": True, "to": phone, "message": message}

    sms_url = getattr(
        settings,
        "SMS_URL",
        "https://bridge.dayliff.com/v1/SMS/sendRawSMS",
    )
    sms_country = country or getattr(settings, "SMS_COUNTRY", "KENYA")

    payload = {
        "content": message,
        "phoneNumber": phone,
        "country": sms_country,
    }
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "D-Api-Key": api_key,
    }

    try:
        response = requests.post(
            sms_url,
            json=payload,
            headers=headers,
            timeout=30,
        )
        http_code = response.status_code
        try:
            body = response.json()
        except ValueError:
            body = {"text": response.text}

        if http_code >= 400:
            logger.error(
                "SMS send failed to=%s http=%s body=%s",
                phone,
                http_code,
                body,
            )
            return {
                "ok": False,
                "http_code": http_code,
                "response": body,
                "error": f"HTTP {http_code}",
            }

        logger.info(
            "SMS sent to=%s http=%s response=%s",
            phone,
            http_code,
            body,
        )
        return {"ok": True, "http_code": http_code, "response": body}

    except requests.RequestException as exc:
        logger.error("SMS send failed to=%s err=%s", phone, exc)
        return {"ok": False, "error": str(exc)}


def broadcast_sms(recipients: Iterable[str], message: str) -> list[dict]:
    """Send the same message to several recipients sequentially."""
    return [send_sms(to, message) for to in recipients]
