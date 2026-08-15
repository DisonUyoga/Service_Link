from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [
        ('services', '0002_providerlegaldocument'),
    ]
    operations = [
        migrations.AddField('serviceproviderprofile', 'price_min', models.PositiveIntegerField(default=500)),
        migrations.AddField('serviceproviderprofile', 'price_max', models.PositiveIntegerField(default=2500)),
        migrations.AddField('serviceproviderprofile', 'average_response_minutes', models.PositiveIntegerField(default=15)),
        migrations.AddField('serviceproviderprofile', 'next_available_at', models.DateTimeField(blank=True, null=True)),
        migrations.AddField('jobrequest', 'provider_access_otp', models.CharField(blank=True, max_length=8)),
        migrations.AddField('jobrequest', 'provider_access_token', models.CharField(blank=True, max_length=64)),
        migrations.AddField('jobrequest', 'ai_match_reason', models.TextField(blank=True)),
        migrations.AddField('jobrequest', 'client_price_preference', models.CharField(blank=True, max_length=16)),
        migrations.AddField('jobrequest', 'quoted_price', models.PositiveIntegerField(blank=True, null=True)),
    ]
