from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("payments", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="payment",
            name="checkout_request_id",
            field=models.CharField(blank=True, max_length=64),
        ),
        migrations.AddField(
            model_name="payment",
            name="merchant_request_id",
            field=models.CharField(blank=True, max_length=64),
        ),
        migrations.AddField(
            model_name="payment",
            name="phone_number",
            field=models.CharField(blank=True, max_length=20),
        ),
        migrations.AddField(
            model_name="payment",
            name="result_code",
            field=models.CharField(blank=True, max_length=8),
        ),
        migrations.AddField(
            model_name="payment",
            name="result_desc",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AlterField(
            model_name="payment",
            name="mpesa_reference",
            field=models.CharField(
                blank=True,
                help_text="MpesaReceiptNumber returned in the STK callback once the customer pays.",
                max_length=64,
            ),
        ),
    ]
