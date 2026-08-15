from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("payments", "0002_daraja_fields"),
        ("services", "0004_geofence_and_sms_tracking"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="DiscoveryPayment",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "amount",
                    models.DecimalField(
                        decimal_places=2, default=50, max_digits=10
                    ),
                ),
                ("currency", models.CharField(default="KES", max_length=8)),
                ("phone_number", models.CharField(max_length=20)),
                ("category_id", models.IntegerField(blank=True, null=True)),
                ("lat", models.FloatField(blank=True, null=True)),
                ("lng", models.FloatField(blank=True, null=True)),
                ("query", models.CharField(blank=True, max_length=255)),
                (
                    "provider_count",
                    models.PositiveIntegerField(default=0),
                ),
                (
                    "checkout_request_id",
                    models.CharField(
                        blank=True, db_index=True, max_length=64
                    ),
                ),
                (
                    "merchant_request_id",
                    models.CharField(blank=True, max_length=64),
                ),
                (
                    "mpesa_reference",
                    models.CharField(blank=True, max_length=64),
                ),
                ("result_code", models.CharField(blank=True, max_length=8)),
                (
                    "result_desc",
                    models.CharField(blank=True, max_length=255),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending", "Pending"),
                            ("success", "Success"),
                            ("failed", "Failed"),
                            ("expired", "Expired"),
                        ],
                        default="pending",
                        max_length=16,
                    ),
                ),
                (
                    "consumed_at",
                    models.DateTimeField(
                        blank=True,
                        null=True,
                        help_text="Set when the customer used this paid session to create a JobRequest.",
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "customer",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="discovery_payments",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "consumed_job",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=models.deletion.SET_NULL,
                        related_name="discovery_payments",
                        to="services.jobrequest",
                    ),
                ),
            ],
            options={"ordering": ["-created_at"]},
        ),
    ]
