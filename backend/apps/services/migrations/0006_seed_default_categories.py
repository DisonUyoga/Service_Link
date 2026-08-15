from django.db import migrations


DEFAULT_CATEGORIES = [
    ("Plumbing", "plumbing"),
    ("Electrical", "electrical_services"),
    ("Cleaning", "cleaning_services"),
    ("Appliance Repair", "home_repair_service"),
    ("Salon & Beauty", "spa"),
    ("Carpentry", "carpenter"),
    ("Mechanic", "car_repair"),
    ("Pest Control", "pest_control"),
    ("Painting", "format_paint"),
    ("Laundry", "local_laundry_service"),
]


def seed_categories(apps, schema_editor):
    ServiceCategory = apps.get_model("services", "ServiceCategory")
    for name, icon in DEFAULT_CATEGORIES:
        ServiceCategory.objects.update_or_create(
            name=name,
            defaults={"icon": icon},
        )


def unseed_categories(apps, schema_editor):
    # Intentional no-op: rolling back this migration should not delete
    # categories the operator may have customised.
    return


class Migration(migrations.Migration):

    dependencies = [
        ("services", "0005_provider_live_location"),
    ]

    operations = [
        migrations.RunPython(seed_categories, unseed_categories),
    ]
