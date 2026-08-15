from django.conf import settings
from django.db import models

from apps.services.models import JobRequest


User = settings.AUTH_USER_MODEL


class Payment(models.Model):
    STATUS_CHOICES = [
        ("initiated", "Initiated"),
        ("pending", "Pending"),
        ("success", "Success"),
        ("failed", "Failed"),
    ]

    job = models.OneToOneField(JobRequest, on_delete=models.CASCADE, related_name="payment")
    provider = models.ForeignKey(User, on_delete=models.CASCADE, related_name="payments")
    amount = models.DecimalField(max_digits=10, decimal_places=2, default=50)
    currency = models.CharField(max_length=8, default="KES")
    mpesa_reference = models.CharField(
        max_length=64,
        blank=True,
        help_text="MpesaReceiptNumber returned in the STK callback once the customer pays.",
    )
    checkout_request_id = models.CharField(max_length=64, blank=True)
    merchant_request_id = models.CharField(max_length=64, blank=True)
    phone_number = models.CharField(max_length=20, blank=True)
    result_code = models.CharField(max_length=8, blank=True)
    result_desc = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default="initiated")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"Payment {self.id} for job {self.job_id} ({self.status})"


class DiscoveryPayment(models.Model):
    """A small fee a customer pays *before* seeing matched provider profiles.

    The same object survives across the search → pick → job-create flow. When
    the customer eventually creates a ``JobRequest``, the mobile app passes
    ``discovery_payment_id`` so the backend can auto-mark the resulting job
    as paid (since the customer has already paid the connection fee).
    """

    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("success", "Success"),
        ("failed", "Failed"),
        ("expired", "Expired"),
    ]

    customer = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="discovery_payments"
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2, default=50)
    currency = models.CharField(max_length=8, default="KES")
    phone_number = models.CharField(max_length=20)

    # Search session metadata so we can scope/refund/audit a search later.
    category_id = models.IntegerField(null=True, blank=True)
    lat = models.FloatField(null=True, blank=True)
    lng = models.FloatField(null=True, blank=True)
    query = models.CharField(max_length=255, blank=True)
    provider_count = models.PositiveIntegerField(default=0)

    # Daraja STK fields.
    checkout_request_id = models.CharField(max_length=64, blank=True, db_index=True)
    merchant_request_id = models.CharField(max_length=64, blank=True)
    mpesa_reference = models.CharField(max_length=64, blank=True)
    result_code = models.CharField(max_length=8, blank=True)
    result_desc = models.CharField(max_length=255, blank=True)
    status = models.CharField(
        max_length=16, choices=STATUS_CHOICES, default="pending"
    )

    consumed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Set when the customer used this paid session to create a JobRequest.",
    )
    consumed_job = models.ForeignKey(
        "services.JobRequest",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="discovery_payments",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Discovery {self.id} ({self.status}) by {self.customer_id}"

    @property
    def is_paid(self) -> bool:
        return self.status == "success"

