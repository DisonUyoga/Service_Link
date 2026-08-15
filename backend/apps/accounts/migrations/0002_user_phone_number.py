from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="phone_number",
            field=models.CharField(
                blank=True,
                help_text="MSISDN in international format e.g. 254712345678. Used for SMS notifications.",
                max_length=20,
            ),
        ),
    ]
