import logging

from django.conf import settings
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.services.models import JobRequest

from .daraja_client import (
    DarajaError,
    parse_callback,
    stk_push,
    stk_query,
)
from .models import DiscoveryPayment, Payment
from .serializers import DiscoveryPaymentSerializer, PaymentSerializer


logger = logging.getLogger("s_link.daraja")


DISCOVERY_FEE_MIN = 50


class InitiatePaymentView(generics.CreateAPIView):
    """Start an M-Pesa STK push for a given job."""

    serializer_class = PaymentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def create(self, request, *args, **kwargs):
        job_id = request.data.get("job")
        job = get_object_or_404(JobRequest, id=job_id)

        if job.provider is None:
            return Response(
                {"detail": "Job has no assigned provider."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if hasattr(job, "payment"):
            payment = job.payment
        else:
            payment = Payment.objects.create(
                job=job,
                provider=job.provider,
                amount=50,
            )

        # Resolve a usable phone number, in priority order:
        #   1. Phone explicitly sent in the request body.
        #   2. Phone stored on the customer's user profile.
        #   3. Customer username (legacy fallback when username == phone).
        phone_number = (
            request.data.get("phone_number")
            or getattr(job.customer, "phone_number", "")
            or job.customer.username
        )
        phone_number = str(phone_number).strip()
        if not phone_number:
            return Response(
                {"detail": "M-Pesa phone number is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            resp_data = stk_push(
                phone_number=phone_number,
                amount=int(payment.amount),
                account_reference=f"SL{job.id}",
                description="S-Link fee",
            )
        except DarajaError as exc:
            logger.error("STK push failed for job=%s: %s", job.id, exc)
            payment.status = "failed"
            payment.result_desc = str(exc)[:255]
            payment.save(update_fields=["status", "result_desc"])
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        payment.status = "pending"
        payment.phone_number = phone_number
        payment.checkout_request_id = resp_data.get("CheckoutRequestID", "")
        payment.merchant_request_id = resp_data.get("MerchantRequestID", "")
        payment.save(
            update_fields=[
                "status",
                "phone_number",
                "checkout_request_id",
                "merchant_request_id",
            ]
        )

        serializer = self.get_serializer(payment)
        return Response(
            {
                **serializer.data,
                "customer_message": resp_data.get("CustomerMessage", ""),
                "response_description": resp_data.get("ResponseDescription", ""),
            },
            status=status.HTTP_201_CREATED,
        )


class MpesaCallbackView(APIView):
    """Webhook endpoint for Daraja STK push callbacks.

    Daraja always expects a 200 response, even when we cannot match the
    callback to a known payment, otherwise it will keep retrying.
    """

    authentication_classes = []
    permission_classes = []

    def post(self, request, *args, **kwargs):
        body = request.data if isinstance(request.data, dict) else {}
        logger.info("Daraja callback received: %s", body)

        # If the payload is shaped like a Daraja STK callback, parse the
        # nested fields. Otherwise fall back to the legacy flat shape so
        # internal/manual callers still work.
        if isinstance(body, dict) and "Body" in body:
            parsed = parse_callback(body)
            checkout_id = parsed["checkout_request_id"]

            # Discovery (pre-search) payment first.
            discovery = DiscoveryPayment.objects.filter(
                checkout_request_id=checkout_id
            ).first()
            if discovery is not None:
                discovery.merchant_request_id = (
                    parsed["merchant_request_id"]
                    or discovery.merchant_request_id
                )
                discovery.result_code = str(parsed["result_code"] or "")
                discovery.result_desc = (parsed["result_desc"] or "")[:255]
                discovery.mpesa_reference = (
                    parsed["mpesa_receipt"] or discovery.mpesa_reference
                )
                if str(parsed["result_code"]) == "0":
                    discovery.status = "success"
                else:
                    discovery.status = "failed"
                discovery.save(
                    update_fields=[
                        "merchant_request_id",
                        "result_code",
                        "result_desc",
                        "mpesa_reference",
                        "status",
                    ]
                )
                return Response({"ResultCode": 0, "ResultDesc": "Accepted"})

            payment = Payment.objects.filter(
                checkout_request_id=checkout_id
            ).first()
            if payment is None:
                logger.warning(
                    "No payment matched CheckoutRequestID=%s", checkout_id
                )
                return Response({"ResultCode": 0, "ResultDesc": "Accepted"})

            payment.merchant_request_id = (
                parsed["merchant_request_id"] or payment.merchant_request_id
            )
            payment.result_code = str(parsed["result_code"] or "")
            payment.result_desc = (parsed["result_desc"] or "")[:255]
            payment.mpesa_reference = (
                parsed["mpesa_receipt"] or payment.mpesa_reference
            )

            if str(parsed["result_code"]) == "0":
                payment.status = "success"
                job = payment.job
                job.is_paid = True
                if job.status == "accepted":
                    job.status = "in_progress"
                job.save(update_fields=["is_paid", "status"])
            else:
                payment.status = "failed"

            payment.save(
                update_fields=[
                    "merchant_request_id",
                    "result_code",
                    "result_desc",
                    "mpesa_reference",
                    "status",
                ]
            )

            return Response({"ResultCode": 0, "ResultDesc": "Accepted"})

        # ---- Legacy / internal flat callback ----
        job_id = body.get("job_id")
        result_code = body.get("result_code")
        reference = body.get("mpesa_reference", "")
        if not job_id:
            return Response({"detail": "Unrecognised callback payload."})

        payment = get_object_or_404(Payment, job_id=job_id)
        payment.mpesa_reference = reference
        if str(result_code) == "0":
            payment.status = "success"
            job = payment.job
            job.is_paid = True
            job.status = "in_progress"
            job.save(update_fields=["is_paid", "status"])
        else:
            payment.status = "failed"
        payment.save(update_fields=["mpesa_reference", "status"])
        return Response({"detail": "Callback processed."})


class InitiateDiscoveryPaymentView(APIView):
    """Charge the customer the discovery / connection fee BEFORE showing
    matched provider profiles.

    The mobile app calls this from the search results screen as soon as
    the AI matcher returns a non-empty list. The provider profiles stay
    locked until the resulting ``DiscoveryPayment`` is in ``success`` state.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        # Feature flag — when the connection fee is disabled, return a
        # synthetic "already paid" discovery record without calling Daraja
        # so the mobile flow keeps working transparently.
        if not getattr(settings, "CONNECTION_FEE_ENABLED", False):
            discovery = DiscoveryPayment.objects.create(
                customer=request.user,
                amount=0,
                phone_number=str(request.data.get("phone_number") or "")[:20],
                category_id=request.data.get("category_id") or None,
                lat=request.data.get("lat"),
                lng=request.data.get("lng"),
                query=str(request.data.get("query") or "")[:255],
                provider_count=int(request.data.get("provider_count") or 0),
                status="success",
                result_desc="Connection fee disabled by feature flag.",
            )
            return Response(
                {
                    **DiscoveryPaymentSerializer(discovery).data,
                    "fee_enabled": False,
                    "customer_message": "Connection fee is currently waived.",
                },
                status=status.HTTP_201_CREATED,
            )

        try:
            amount = int(request.data.get("amount") or DISCOVERY_FEE_MIN)
        except (TypeError, ValueError):
            amount = DISCOVERY_FEE_MIN
        if amount < DISCOVERY_FEE_MIN:
            amount = DISCOVERY_FEE_MIN

        phone = (
            request.data.get("phone_number")
            or getattr(request.user, "phone_number", "")
        )
        phone = str(phone or "").strip()
        if not phone:
            return Response(
                {"detail": "M-Pesa phone number is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        discovery = DiscoveryPayment.objects.create(
            customer=request.user,
            amount=amount,
            phone_number=phone,
            category_id=request.data.get("category_id") or None,
            lat=request.data.get("lat"),
            lng=request.data.get("lng"),
            query=str(request.data.get("query") or "")[:255],
            provider_count=int(request.data.get("provider_count") or 0),
        )

        try:
            resp_data = stk_push(
                phone_number=phone,
                amount=amount,
                account_reference=f"DSC{discovery.id}",
                description="S-Link fee",
            )
        except DarajaError as exc:
            logger.error("STK push (discovery) failed id=%s: %s", discovery.id, exc)
            discovery.status = "failed"
            discovery.result_desc = str(exc)[:255]
            discovery.save(update_fields=["status", "result_desc"])
            return Response(
                {"detail": str(exc), "discovery": DiscoveryPaymentSerializer(discovery).data},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        discovery.checkout_request_id = resp_data.get("CheckoutRequestID", "")
        discovery.merchant_request_id = resp_data.get("MerchantRequestID", "")
        discovery.save(
            update_fields=["checkout_request_id", "merchant_request_id"]
        )

        return Response(
            {
                **DiscoveryPaymentSerializer(discovery).data,
                "customer_message": resp_data.get("CustomerMessage", ""),
                "response_description": resp_data.get("ResponseDescription", ""),
            },
            status=status.HTTP_201_CREATED,
        )


@api_view(["GET", "POST"])
@permission_classes([permissions.IsAuthenticated])
def query_discovery_payment(request, discovery_id: int):
    """Live status of an in-flight discovery payment. Polls Daraja if pending."""
    discovery = get_object_or_404(
        DiscoveryPayment, id=discovery_id, customer=request.user
    )

    if discovery.status == "success":
        return Response(DiscoveryPaymentSerializer(discovery).data)

    if not discovery.checkout_request_id:
        return Response(
            {"detail": "No CheckoutRequestID stored for this discovery payment."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        body = stk_query(discovery.checkout_request_id)
    except DarajaError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

    result_code = str(body.get("ResultCode", ""))
    discovery.result_code = result_code or discovery.result_code
    discovery.result_desc = (
        body.get("ResultDesc") or discovery.result_desc or ""
    )[:255]
    if result_code == "0":
        discovery.status = "success"
    elif result_code:
        discovery.status = "failed"
    discovery.save(update_fields=["status", "result_code", "result_desc"])

    return Response(
        {
            **DiscoveryPaymentSerializer(discovery).data,
            "raw": body,
        }
    )


@api_view(["GET", "POST"])
@permission_classes([permissions.IsAuthenticated])
def query_payment(request, job_id: int):
    """Ask Daraja for the live status of a pending STK push.

    Useful when the public callback URL is not reachable (e.g. running on
    localhost). The mobile app can call this while polling instead of relying
    purely on the callback to flip ``is_paid``.
    """
    payment = get_object_or_404(Payment, job_id=job_id)

    if not payment.checkout_request_id:
        return Response(
            {"detail": "No CheckoutRequestID stored for this payment."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        body = stk_query(payment.checkout_request_id)
    except DarajaError as exc:
        return Response(
            {"detail": str(exc)},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    result_code = str(body.get("ResultCode", ""))
    payment.result_code = result_code or payment.result_code
    payment.result_desc = (
        body.get("ResultDesc") or payment.result_desc or ""
    )[:255]

    if result_code == "0":
        payment.status = "success"
        job = payment.job
        if not job.is_paid:
            job.is_paid = True
            if job.status == "accepted":
                job.status = "in_progress"
            job.save(update_fields=["is_paid", "status"])
    elif result_code:
        payment.status = "failed"

    payment.save(update_fields=["status", "result_code", "result_desc"])

    return Response(
        {
            "status": payment.status,
            "result_code": payment.result_code,
            "result_desc": payment.result_desc,
            "is_paid": payment.job.is_paid,
            "raw": body,
        }
    )
