from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("services", "0004_geofence_and_sms_tracking"),
    ]

    operations = [
        migrations.AddField(
            model_name="serviceproviderprofile",
            name="current_lat",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="serviceproviderprofile",
            name="current_lng",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="serviceproviderprofile",
            name="last_seen_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
