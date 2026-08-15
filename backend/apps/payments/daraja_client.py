"""Daraja STK Push client for S-Link.

Reads sandbox/production configuration from Django settings:

- ``MPESA_BASE_URL``        - https://sandbox.safaricom.co.ke or https://api.safaricom.co.ke
- ``MPESA_CONSUMER_KEY``    - OAuth consumer key (from Daraja portal)
- ``MPESA_CONSUMER_SECRET`` - OAuth consumer secret
- ``MPESA_SHORTCODE``       - Lipa Na M-Pesa Online shortcode (e.g. 174379 sandbox)
- ``MPESA_PASSKEY``         - Lipa Na M-Pesa Online passkey
- ``MPESA_CALLBACK_URL``    - Public HTTPS URL Daraja will POST results to
- ``MPESA_TRANSACTION_TYPE``- ``CustomerPayBillOnline`` or ``CustomerBuyGoodsOnline``

Sandbox docs:
- STK push:  POST {base}/mpesa/stkpush/v1/processrequest
- STK query: POST {base}/mpesa/stkpushquery/v1/query
- OAuth:     GET  {base}/oauth/v1/generate?grant_type=client_credentials
"""

from __future__ import annotations

import base64
import logging
import time
from datetime import datetime
from typing import Optional

import requests
from django.conf import settings


logger = logging.getLogger("s_link.daraja")

_TOKEN_CACHE: dict[str, float | str] = {"token": "", "expires_at": 0}


class DarajaError(Exception):
    """Raised when the Daraja API returns an error or is misconfigured."""


def _base_url() -> str:
    return getattr(
        settings, "MPESA_BASE_URL", "https://sandbox.safaricom.co.ke"
    ).rstrip("/")


def _normalize_msisdn(raw: str) -> str:
    """Convert any common Kenyan format to ``2547XXXXXXXX``.

    Daraja silently rejects ``+2547...`` and ``07...``.
    """
    if not raw:
        return ""
    cleaned = str(raw).strip().replace(" ", "").replace("-", "")
    if cleaned.startswith("+"):
        cleaned = cleaned[1:]
    if cleaned.startswith("0") and len(cleaned) >= 10:
        cleaned = "254" + cleaned[1:]
    return cleaned


def _password_and_timestamp() -> tuple[str, str]:
    shortcode = getattr(settings, "MPESA_SHORTCODE", "")
    passkey = getattr(settings, "MPESA_PASSKEY", "")
    if not shortcode or not passkey:
        raise DarajaError(
            "MPESA_SHORTCODE / MPESA_PASSKEY are not configured."
        )
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    raw = f"{shortcode}{passkey}{timestamp}"
    password = base64.b64encode(raw.encode()).decode()
    return password, timestamp


def get_oauth_token(force: bool = False) -> str:
    """Return a cached OAuth token. Tokens are valid ~1 h, we refresh after 50 min."""
    now = time.time()
    if not force and _TOKEN_CACHE.get("token") and float(
        _TOKEN_CACHE.get("expires_at", 0)
    ) > now:
        return str(_TOKEN_CACHE["token"])

    key = getattr(settings, "MPESA_CONSUMER_KEY", "")
    secret = getattr(settings, "MPESA_CONSUMER_SECRET", "")
    if not key or not secret:
        raise DarajaError(
            "MPESA_CONSUMER_KEY / MPESA_CONSUMER_SECRET are not configured. "
            "Add them to your environment to enable real M-Pesa STK push."
        )

    url = f"{_base_url()}/oauth/v1/generate?grant_type=client_credentials"
    try:
        resp = requests.get(url, auth=(key, secret), timeout=15)
        resp.raise_for_status()
    except requests.RequestException as exc:
        raise DarajaError(f"Could not obtain Daraja OAuth token: {exc}") from exc

    data = resp.json()
    token = data.get("access_token")
    if not token:
        raise DarajaError(f"Unexpected OAuth response: {data}")

    _TOKEN_CACHE["token"] = token
    _TOKEN_CACHE["expires_at"] = now + 50 * 60
    return token


def stk_push(
    phone_number: str,
    amount: int,
    account_reference: str,
    description: str,
    *,
    callback_url: Optional[str] = None,
) -> dict:
    """Trigger an STK push and return Daraja's JSON response.

    Daraja silently truncates ``AccountReference`` (max 12 chars) and
    rejects ``TransactionDesc`` longer than 13 chars, so we trim them here.
    """
    token = get_oauth_token()
    password, timestamp = _password_and_timestamp()
    shortcode = settings.MPESA_SHORTCODE
    transaction_type = getattr(
        settings, "MPESA_TRANSACTION_TYPE", "CustomerPayBillOnline"
    )
    callback = callback_url or getattr(settings, "MPESA_CALLBACK_URL", "")

    if not callback:
        raise DarajaError(
            "MPESA_CALLBACK_URL is not configured (Daraja requires HTTPS)."
        )

    msisdn = _normalize_msisdn(phone_number)
    if len(msisdn) < 12:
        raise DarajaError(
            f"Invalid phone number {phone_number!r}; expected 2547XXXXXXXX."
        )

    payload = {
        "BusinessShortCode": shortcode,
        "Password": password,
        "Timestamp": timestamp,
        "TransactionType": transaction_type,
        "Amount": int(amount),
        "PartyA": msisdn,
        "PartyB": shortcode,
        "PhoneNumber": msisdn,
        "CallBackURL": callback,
        "AccountReference": str(account_reference)[:12],
        "TransactionDesc": str(description)[:13],
    }

    headers = {"Authorization": f"Bearer {token}"}
    url = f"{_base_url()}/mpesa/stkpush/v1/processrequest"

    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=20)
        body = resp.json() if resp.headers.get("content-type", "").startswith(
            "application/json"
        ) else {"raw": resp.text}
    except requests.RequestException as exc:
        raise DarajaError(f"STK push request failed: {exc}") from exc

    if resp.status_code >= 400:
        logger.error("STK push HTTP %s body=%s", resp.status_code, body)
        raise DarajaError(
            f"Daraja STK push rejected ({resp.status_code}): {body}"
        )

    if str(body.get("ResponseCode", "")) not in {"0", ""}:
        logger.error("STK push business error body=%s", body)
        raise DarajaError(
            body.get("errorMessage")
            or body.get("ResponseDescription")
            or f"STK push failed: {body}"
        )

    logger.info(
        "STK push ok phone=%s checkout=%s merchant=%s",
        msisdn,
        body.get("CheckoutRequestID"),
        body.get("MerchantRequestID"),
    )
    return body


def stk_query(checkout_request_id: str) -> dict:
    """Query an in-flight STK push using its ``CheckoutRequestID``."""
    if not checkout_request_id:
        raise DarajaError("checkout_request_id is required for STK query")

    token = get_oauth_token()
    password, timestamp = _password_and_timestamp()
    shortcode = settings.MPESA_SHORTCODE

    payload = {
        "BusinessShortCode": shortcode,
        "Password": password,
        "Timestamp": timestamp,
        "CheckoutRequestID": checkout_request_id,
    }
    headers = {"Authorization": f"Bearer {token}"}
    url = f"{_base_url()}/mpesa/stkpushquery/v1/query"

    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=20)
        body = resp.json() if resp.headers.get("content-type", "").startswith(
            "application/json"
        ) else {"raw": resp.text}
    except requests.RequestException as exc:
        raise DarajaError(f"STK query failed: {exc}") from exc

    if resp.status_code >= 400:
        logger.error("STK query HTTP %s body=%s", resp.status_code, body)
        raise DarajaError(f"Daraja STK query rejected ({resp.status_code}): {body}")

    return body


def parse_callback(body: dict) -> dict:
    """Parse Daraja's STK callback into a flat dict.

    Daraja sends::

        {
          "Body": {
            "stkCallback": {
              "MerchantRequestID": "...",
              "CheckoutRequestID": "...",
              "ResultCode": 0,
              "ResultDesc": "...",
              "CallbackMetadata": {
                "Item": [
                  {"Name": "Amount", "Value": 50},
                  {"Name": "MpesaReceiptNumber", "Value": "QHJ7..."},
                  {"Name": "PhoneNumber", "Value": 2547...}
                ]
              }
            }
          }
        }
    """
    stk = (body.get("Body", {}) or {}).get("stkCallback", {}) or {}
    metadata_items = (stk.get("CallbackMetadata", {}) or {}).get("Item", []) or []
    flat = {item.get("Name"): item.get("Value") for item in metadata_items}

    return {
        "merchant_request_id": stk.get("MerchantRequestID", ""),
        "checkout_request_id": stk.get("CheckoutRequestID", ""),
        "result_code": stk.get("ResultCode"),
        "result_desc": stk.get("ResultDesc", ""),
        "amount": flat.get("Amount"),
        "mpesa_receipt": flat.get("MpesaReceiptNumber", ""),
        "phone_number": flat.get("PhoneNumber"),
    }
