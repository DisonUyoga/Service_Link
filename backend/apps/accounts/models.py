from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    ROLE_CHOICES = [
        ("customer", "Customer"),
        ("provider", "Provider"),
        ("admin", "Admin"),
    ]

    role = models.CharField(max_length=16, choices=ROLE_CHOICES, default="customer")
    phone_number = models.CharField(
        max_length=20,
        blank=True,
        help_text="MSISDN in international format e.g. 254712345678. Used for SMS notifications.",
    )

    @property
    def normalized_msisdn(self) -> str:
        """Return phone in `2547XXXXXXXX` form (best-effort, no plus sign)."""
        raw = (self.phone_number or "").strip().replace(" ", "").replace("-", "")
        if raw.startswith("+"):
            raw = raw[1:]
        if raw.startswith("0") and len(raw) >= 10:
            raw = "254" + raw[1:]
        return raw

