from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="AdPlacement",
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
                ("title", models.CharField(max_length=128)),
                ("description", models.TextField(blank=True)),
                ("category", models.CharField(blank=True, max_length=64)),
                ("target_country", models.CharField(blank=True, max_length=64)),
                ("target_city", models.CharField(blank=True, max_length=64)),
                ("store_lat", models.FloatField(blank=True, null=True)),
                ("store_lng", models.FloatField(blank=True, null=True)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending_review", "Pending review"),
                            ("active", "Active"),
                            ("paused", "Paused"),
                        ],
                        default="pending_review",
                        max_length=16,
                    ),
                ),
                (
                    "amount_paid",
                    models.DecimalField(
                        decimal_places=2, default=0, max_digits=10
                    ),
                ),
                ("starts_at", models.DateTimeField(blank=True, null=True)),
                ("ends_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "sponsor",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="ads",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
        ),
    ]
