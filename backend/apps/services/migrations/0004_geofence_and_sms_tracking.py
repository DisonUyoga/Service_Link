from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("services", "0003_ai_matching_demo_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="jobrequest",
            name="requested_radius_km",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="jobrequest",
            name="pending_since",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="jobrequest",
            name="request_sms_sent_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="jobrequest",
            name="arrival_sms_sent_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="jobrequest",
            name="expired_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="jobrequest",
            name="fallback_provider_id",
            field=models.IntegerField(blank=True, null=True),
        ),
    ]
