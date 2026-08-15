from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.db import connection, transaction
from django.utils import timezone

from apps.services.models import (
    ServiceCategory,
    ServiceProviderProfile,
    JobRequest,
    Rating,
    ProviderLocation,
    ProviderLegalDocument,
)
from apps.payments.models import Payment

try:
    from apps.ads.models import AdPlacement
except Exception:
    AdPlacement = None


User = get_user_model()
DEMO_PASSWORD = "DemoPass123!"


SERVICES = [
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


# Each provider tuple:
# (username, full_name, category, lat, lng, price_min, price_max, rating, completed_jobs, status, response_minutes)
PROVIDERS = [
    # ── Plumbing (5) ──────────────────────────────────────────────────────────
    ("plumber_01", "James Mwangi",    "Plumbing", -1.2921, 36.8219, 600,  1800, 4.7, 38, "available", 12),
    ("plumber_02", "John Kariuki",    "Plumbing", -1.2864, 36.8172, 700,  2200, 4.5, 29, "available", 16),
    ("plumber_03", "Isaac Omondi",    "Plumbing", -1.3032, 36.7073, 800,  2600, 4.6, 51, "busy",      25),
    ("plumber_04", "Moses Karanja",   "Plumbing", -1.2676, 36.8108, 650,  2100, 4.2, 21, "available", 20),
    ("plumber_05", "Collins Wekesa", "Plumbing",  -1.3227, 36.7949, 900,  2800, 4.8, 67, "available", 14),

    # ── Electrical (5) ───────────────────────────────────────────────────────
    ("electrician_01", "Brian Otieno",   "Electrical", -1.2657, 36.8085, 1000, 3500, 4.6, 44, "available", 25),
    ("electrician_02", "Paul Maina",     "Electrical", -1.2864, 36.8172, 1200, 4000, 4.8, 72, "available", 15),
    ("electrician_03", "Elijah Kiprono", "Electrical", -1.3032, 36.7073, 900,  3200, 4.3, 26, "busy",      32),
    ("electrician_04", "David Ouma",     "Electrical", -1.2921, 36.7820, 1100, 3800, 4.5, 39, "available", 18),
    ("electrician_05", "Simon Njoroge",  "Electrical", -1.2501, 36.8836, 1300, 4200, 4.7, 54, "available", 17),

    # ── Cleaning (5) ─────────────────────────────────────────────────────────
    ("cleaner_01", "Mary Wanjiku",     "Cleaning", -1.3032, 36.7073, 800,  2500, 4.8, 64, "available", 18),
    ("cleaner_02", "Nancy Achieng",    "Cleaning", -1.2921, 36.7820, 700,  2200, 4.6, 42, "available", 15),
    ("cleaner_03", "Rose Njeri",       "Cleaning", -1.2676, 36.8108, 900,  2800, 4.7, 58, "available", 20),
    ("cleaner_04", "Esther Muthoni",   "Cleaning", -1.2230, 36.8970, 750,  2400, 4.4, 31, "busy",      35),
    ("cleaner_05", "Mercy Atieno",     "Cleaning", -1.3227, 36.7949, 1000, 3000, 4.9, 86, "available", 12),

    # ── Appliance Repair (5) ─────────────────────────────────────────────────
    ("appliance_01", "Grace Nyambura",  "Appliance Repair", -1.2196, 36.8862, 1500, 6000, 4.4, 29, "busy",      35),
    ("appliance_02", "Patrick Ochieng", "Appliance Repair", -1.3032, 36.7073, 1300, 5500, 4.7, 48, "available", 19),
    ("appliance_03", "Victor Muthama",  "Appliance Repair", -1.2864, 36.8172, 1200, 5200, 4.5, 36, "available", 22),
    ("appliance_04", "Diana Awuor",     "Appliance Repair", -1.2676, 36.8108, 1400, 5800, 4.3, 24, "available", 28),
    ("appliance_05", "Edwin Kamau",     "Appliance Repair", -1.2921, 36.7820, 1100, 5000, 4.6, 41, "available", 20),

    # ── Salon & Beauty (5) ───────────────────────────────────────────────────
    ("beauty_01", "Amina Hassan",    "Salon & Beauty", -1.2864, 36.8172, 700,  3000, 4.9, 92, "available", 10),
    ("beauty_02", "Grace Anyango",   "Salon & Beauty", -1.2921, 36.7820, 800,  3200, 4.6, 41, "available", 18),
    ("beauty_03", "Lydia Wambua",    "Salon & Beauty", -1.2501, 36.8836, 750,  3100, 4.7, 55, "available", 15),
    ("beauty_04", "Sharon Akinyi",   "Salon & Beauty", -1.3032, 36.7073, 900,  3500, 4.5, 38, "busy",      25),
    ("beauty_05", "Pauline Ndungu",  "Salon & Beauty", -1.2676, 36.8108, 850,  3300, 4.8, 63, "available", 12),

    # ── Carpentry (5) ────────────────────────────────────────────────────────
    ("carpenter_01", "Peter Kamau",    "Carpentry", -1.3227, 36.7949, 1200, 5000, 4.5, 57, "available", 20),
    ("carpenter_02", "Michael Njenga", "Carpentry", -1.2676, 36.8108, 1000, 4500, 4.3, 34, "available", 22),
    ("carpenter_03", "Samuel Gitau",   "Carpentry", -1.2864, 36.8172, 1100, 4800, 4.6, 49, "available", 18),
    ("carpenter_04", "Dennis Mutua",   "Carpentry", -1.3032, 36.7073, 900,  4200, 4.2, 28, "busy",      30),
    ("carpenter_05", "Alex Onyango",   "Carpentry", -1.2921, 36.7820, 1300, 5200, 4.7, 61, "available", 16),

    # ── Mechanic (5) ─────────────────────────────────────────────────────────
    ("mechanic_01", "Daniel Mutiso",  "Mechanic", -1.3099, 36.8282, 1000, 4500, 4.3, 31, "available", 22),
    ("mechanic_02", "Peter Mwangi",   "Mechanic", -1.2864, 36.8172, 1200, 5000, 4.7, 66, "available", 18),
    ("mechanic_03", "George Kamau",   "Mechanic", -1.2921, 36.7820, 1500, 6000, 4.8, 82, "available", 14),
    ("mechanic_04", "Ahmed Hassan",   "Mechanic", -1.3227, 36.7949, 1300, 5500, 4.6, 53, "available", 19),
    ("mechanic_05", "Martin Ochieng", "Mechanic", -1.2574, 36.7873, 1400, 6200, 4.9, 91, "available", 12),

    # ── Pest Control (5) ─────────────────────────────────────────────────────
    ("pest_01", "Faith Chebet",   "Pest Control", -1.2574, 36.7873, 1800, 7000, 4.6, 22, "available", 30),
    ("pest_02", "Robert Mwenda",  "Pest Control", -1.2921, 36.7820, 1600, 6500, 4.5, 30, "available", 28),
    ("pest_03", "Charles Oduya",  "Pest Control", -1.2864, 36.8172, 1700, 6800, 4.7, 44, "available", 25),
    ("pest_04", "Irene Wanjiku",  "Pest Control", -1.3032, 36.7073, 1500, 6200, 4.4, 27, "busy",      35),
    ("pest_05", "Tom Kimani",     "Pest Control", -1.2676, 36.8108, 2000, 7500, 4.8, 51, "available", 20),

    # ── Painting (5) ─────────────────────────────────────────────────────────
    ("painter_01", "Kevin Odhiambo", "Painting", -1.2833, 36.7500, 1500, 6500, 4.2, 18, "available", 28),
    ("painter_02", "Evans Mutua",    "Painting", -1.2864, 36.8172, 1400, 6000, 4.5, 32, "available", 21),
    ("painter_03", "Joseph Njiru",   "Painting", -1.2921, 36.7820, 1300, 5800, 4.6, 45, "available", 18),
    ("painter_04", "Stella Moraa",   "Painting", -1.3032, 36.7073, 1200, 5500, 4.3, 29, "busy",      30),
    ("painter_05", "Felix Otieno",   "Painting", -1.2676, 36.8108, 1600, 7000, 4.7, 56, "available", 16),

    # ── Laundry (5) ──────────────────────────────────────────────────────────
    ("laundry_01", "Lucy Njeri",    "Laundry", -1.2501, 36.8836, 500, 2200, 4.5, 41, "available", 16),
    ("laundry_02", "Sarah Wambui",  "Laundry", -1.3032, 36.7073, 600, 2400, 4.4, 36, "available", 19),
    ("laundry_03", "Ann Cherono",   "Laundry", -1.2864, 36.8172, 550, 2300, 4.6, 48, "available", 14),
    ("laundry_04", "Beatrice Juma", "Laundry", -1.2921, 36.7820, 700, 2600, 4.3, 27, "busy",      25),
    ("laundry_05", "Cynthia Oloo",  "Laundry", -1.2676, 36.8108, 650, 2500, 4.7, 59, "available", 12),
]

CUSTOMERS = [
    ("demo_customer",    "Demo Customer",     "customer@demo.local"),
    ("westlands_client", "Westlands Client",  "westlands.client@demo.local"),
    ("kilimani_client",  "Kilimani Client",   "kilimani.client@demo.local"),
    ("kasarani_client",  "Kasarani Client",   "kasarani.client@demo.local"),
]


# Each job tuple:
# (customer_username, provider_username, category, description,
#  lat, lng, address, status, price_preference, quote, score, comment)
JOBS = [
    (
        "demo_customer", "plumber_01", "Plumbing",
        "Kitchen sink leak repair",
        -1.286389, 36.817223, "Nairobi CBD",
        "completed", "standard", 1200, 5, "Fast, polite and fixed the leak.",
    ),
    (
        "westlands_client", "cleaner_01", "Cleaning",
        "Deep cleaning two-bedroom apartment",
        -1.2676, 36.8108, "Westlands",
        "completed", "standard", 2200, 5, "Very thorough cleaning.",
    ),
    (
        "kilimani_client", "electrician_01", "Electrical",
        "Urgent wiring diagnostic",
        -1.2921, 36.7820, "Kilimani",
        "in_progress", "premium", 3200, None, "",
    ),
    (
        "kasarani_client", "appliance_01", "Appliance Repair",
        "Fridge diagnostic and repair",
        -1.2230, 36.8970, "Kasarani",
        "accepted", "standard", 2800, None, "",
    ),
    (
        "demo_customer", "beauty_01", "Salon & Beauty",
        "Home manicure and hair styling",
        -1.286389, 36.817223, "Nairobi CBD",
        "completed", "premium", 2600, 5, "Excellent service and arrived quickly.",
    ),
    (
        "westlands_client", "mechanic_01", "Mechanic",
        "Battery check and minor repair",
        -1.2676, 36.8108, "Westlands",
        "completed", "budget", 1400, 4, "Good diagnosis and fair price.",
    ),
    (
        "kilimani_client", "carpenter_01", "Carpentry",
        "Repair wardrobe hinges",
        -1.2921, 36.7820, "Kilimani",
        "pending_provider", "budget", 1500, None, "",
    ),
    (
        "kasarani_client", "painter_01", "Painting",
        "Interior painting two rooms",
        -1.2230, 36.8970, "Kasarani",
        "completed", "standard", 5500, 4, "Neat work and finished on time.",
    ),
    (
        "demo_customer", "pest_01", "Pest Control",
        "Cockroach fumigation entire house",
        -1.286389, 36.817223, "Nairobi CBD",
        "completed", "standard", 3500, 5, "Thorough job, no more pests.",
    ),
    (
        "westlands_client", "laundry_01", "Laundry",
        "Wash and iron weekly clothes bundle",
        -1.2676, 36.8108, "Westlands",
        "in_progress", "budget", 900, None, "",
    ),
]


ADS = [
    ("Hardware Hub Ngong Road", "Tools and fittings for plumbers and electricians", "tools",      "Nairobi", -1.3001, 36.7834, "active", 2500),
    ("CleanPro Supplies",       "Detergents, gloves and cleaning machines",          "materials",  "Nairobi", -1.3032, 36.7073, "active", 1800),
    ("AutoCare Spares",         "Car batteries, oil and fast-moving spares",         "auto",       "Nairobi", -1.3099, 36.8282, "active", 3000),
]


def table_exists(table_name):
    return table_name in connection.introspection.table_names()


def split_name(full_name):
    parts = full_name.split(" ", 1)
    first_name = parts[0]
    last_name = parts[1] if len(parts) > 1 else ""
    return first_name, last_name


def provider_tier(completed_jobs, rating):
    if completed_jobs >= 80 and rating >= 4.7:
        return "platinum"
    if completed_jobs >= 50 and rating >= 4.5:
        return "gold"
    if completed_jobs >= 20 and rating >= 4.2:
        return "silver"
    return "bronze"


class Command(BaseCommand):
    help = (
        "Seed Nairobi demo data: 5 providers per category (50 total), "
        "customers, jobs, ratings, payments, locations, legal docs, and ads."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset-demo",
            action="store_true",
            help="Delete demo records before reseeding.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        demo_usernames = (
            [c[0] for c in CUSTOMERS]
            + [p[0] for p in PROVIDERS]
            + ["demo_admin", "demo_sponsor"]
        )

        if options["reset_demo"]:
            self.reset_demo_data(demo_usernames)

        categories = self.seed_categories()
        self.seed_admin()
        sponsor = self.seed_sponsor()
        self.seed_customers()
        self.seed_providers(categories)
        self.seed_jobs(categories)
        self.seed_ads(sponsor)

        self.stdout.write(self.style.SUCCESS("Nairobi demo data seeded successfully."))
        self.stdout.write(f"  Demo password : {DEMO_PASSWORD}")
        self.stdout.write(f"  Providers     : {len(PROVIDERS)} total, 5 per category")
        self.stdout.write( "  Customer login: demo_customer")
        self.stdout.write( "  Admin login   : demo_admin")
        self.stdout.write( "  Provider login: e.g. plumber_01, cleaner_03, mechanic_05")

    # ── Reset ──────────────────────────────────────────────────────────────────

    def reset_demo_data(self, demo_usernames):
        self.stdout.write("Resetting existing demo data...")

        if table_exists(Payment._meta.db_table):
            Payment.objects.filter(provider__username__in=demo_usernames).delete()

        if table_exists(Rating._meta.db_table):
            Rating.objects.filter(customer__username__in=demo_usernames).delete()

        if table_exists(ProviderLocation._meta.db_table):
            ProviderLocation.objects.filter(provider__username__in=demo_usernames).delete()

        if table_exists(JobRequest._meta.db_table):
            JobRequest.objects.filter(customer__username__in=demo_usernames).delete()

        if AdPlacement and table_exists(AdPlacement._meta.db_table):
            AdPlacement.objects.filter(sponsor__username__in=demo_usernames).delete()
        else:
            self.stdout.write(self.style.WARNING("Skipping ads cleanup — ads table does not exist."))

        if table_exists(ProviderLegalDocument._meta.db_table):
            ProviderLegalDocument.objects.filter(profile__user__username__in=demo_usernames).delete()

        if table_exists(ServiceProviderProfile._meta.db_table):
            ServiceProviderProfile.objects.filter(user__username__in=demo_usernames).delete()

        User.objects.filter(username__in=demo_usernames).delete()

    # ── Seed helpers ───────────────────────────────────────────────────────────

    def seed_categories(self):
        categories = {}
        for name, icon in SERVICES:
            category, _ = ServiceCategory.objects.update_or_create(
                name=name,
                defaults={"icon": icon},
            )
            categories[name] = category
        return categories

    def seed_admin(self):
        admin, _ = User.objects.get_or_create(
            username="demo_admin",
            defaults={"email": "admin@demo.local"},
        )
        admin.email = "admin@demo.local"
        admin.role = "admin"
        admin.is_staff = True
        admin.is_superuser = True
        admin.set_password(DEMO_PASSWORD)
        admin.save()
        return admin

    def seed_sponsor(self):
        sponsor, _ = User.objects.get_or_create(
            username="demo_sponsor",
            defaults={"email": "sponsor@demo.local"},
        )
        sponsor.email = "sponsor@demo.local"
        sponsor.role = "provider"
        sponsor.set_password(DEMO_PASSWORD)
        sponsor.save()
        return sponsor

    def seed_customers(self):
        for username, full_name, email in CUSTOMERS:
            first_name, last_name = split_name(full_name)
            user, _ = User.objects.get_or_create(
                username=username,
                defaults={"email": email},
            )
            user.first_name = first_name
            user.last_name = last_name
            user.email = email
            user.role = "customer"
            user.set_password(DEMO_PASSWORD)
            user.save()

    def seed_providers(self, categories):
        for (
            username, full_name, category_name,
            lat, lng, price_min, price_max,
            rating, completed_jobs, status, response_minutes,
        ) in PROVIDERS:
            first_name, last_name = split_name(full_name)

            user, _ = User.objects.get_or_create(
                username=username,
                defaults={"email": f"{username}@demo.local"},
            )
            user.first_name = first_name
            user.last_name = last_name
            user.email = f"{username}@demo.local"
            user.role = "provider"
            user.set_password(DEMO_PASSWORD)
            user.save()

            profile, _ = ServiceProviderProfile.objects.get_or_create(
                user=user,
                defaults={"category": categories[category_name]},
            )
            profile.category = categories[category_name]
            profile.bio = (
                f"Verified Nairobi {category_name.lower()} provider with "
                "demo pricing, rating, and dispatch data."
            )
            profile.base_lat = lat
            profile.base_lng = lng
            profile.service_radius_km = 25
            profile.price_min = price_min
            profile.price_max = price_max
            profile.rating_avg = rating
            profile.rating_count = max(completed_jobs // 2, 1)
            profile.total_jobs_completed = completed_jobs
            profile.verified = True
            profile.is_suspended = False
            profile.current_status = status
            profile.average_response_minutes = response_minutes
            profile.next_available_at = (
                timezone.now() + timedelta(minutes=response_minutes)
                if status == "busy"
                else None
            )
            profile.tier = provider_tier(completed_jobs, rating)
            profile.mpesa_till_or_paybill = "174379"
            profile.save()

            self.seed_provider_document(profile, username, full_name)

    def seed_provider_document(self, profile, username, full_name):
        document, _ = ProviderLegalDocument.objects.get_or_create(
            profile=profile,
            title=f"Demo verification - {full_name}",
        )
        if not document.file:
            document.file.save(
                f"demo-verification-{username}.txt",
                ContentFile(
                    f"Demo-only verification document for {full_name}. "
                    "Use real KYC documents only in production."
                ),
                save=True,
            )

    def seed_jobs(self, categories):
        for (
            customer_username, provider_username, category_name,
            description, lat, lng, address,
            status, price_preference, quote, score, comment,
        ) in JOBS:
            customer = User.objects.get(username=customer_username)
            provider = User.objects.get(username=provider_username)

            job, _ = JobRequest.objects.update_or_create(
                customer=customer,
                provider=provider,
                description=description,
                defaults={
                    "category": categories[category_name],
                    "location_lat": lat,
                    "location_lng": lng,
                    "address_text": address,
                    "status": status,
                    "is_paid": status in ["in_progress", "completed"],
                    "provider_access_otp": "123456",
                    "provider_access_token": f"demo-token-{customer_username}-{provider_username}",
                    "client_price_preference": price_preference,
                    "quoted_price": quote,
                    "ai_match_reason": (
                        f"Demo AI matched {provider_username} for {category_name} "
                        f"using proximity, availability, rating, and predicted price KSh {quote}."
                    ),
                },
            )

            if status in ["accepted", "in_progress", "completed"]:
                Payment.objects.update_or_create(
                    job=job,
                    defaults={
                        "provider": provider,
                        "amount": Decimal("50.00"),
                        "currency": "KES",
                        "mpesa_reference": f"DEMO{job.id:05d}",
                        "status": "success" if status in ["in_progress", "completed"] else "pending",
                    },
                )

                ProviderLocation.objects.update_or_create(
                    provider=provider,
                    job=job,
                    defaults={
                        "lat": lat + 0.003,
                        "lng": lng + 0.002,
                    },
                )

            if score:
                Rating.objects.update_or_create(
                    job=job,
                    defaults={
                        "customer": customer,
                        "provider": provider,
                        "score": score,
                        "comment": comment,
                    },
                )

    def seed_ads(self, sponsor):
        if not AdPlacement or not table_exists(AdPlacement._meta.db_table):
            self.stdout.write(self.style.WARNING("Skipping ads seeding — ads table does not exist."))
            return

        now = timezone.now()

        for title, description, category, city, lat, lng, status, amount in ADS:
            AdPlacement.objects.update_or_create(
                sponsor=sponsor,
                title=title,
                defaults={
                    "description": description,
                    "category": category,
                    "target_country": "Kenya",
                    "target_city": city,
                    "store_lat": lat,
                    "store_lng": lng,
                    "status": status,
                    "amount_paid": Decimal(str(amount)),
                    "starts_at": now - timedelta(days=1),
                    "ends_at": now + timedelta(days=30),
                },
            )