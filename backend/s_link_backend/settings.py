import os
from pathlib import Path

from datetime import timedelta

BASE_DIR = Path(__file__).resolve().parent.parent

# HS256 needs >= 32 bytes; shorter keys trigger InsecureKeyLengthWarning in PyJWT.
SECRET_KEY = os.getenv(
    "DJANGO_SECRET_KEY",
    "s-link-dev-secret-key-min-32-chars-long",
)

DEBUG = os.getenv("DJANGO_DEBUG", "true").lower() == "true"

ALLOWED_HOSTS = os.getenv("DJANGO_ALLOWED_HOSTS", "*").split(",")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework.authtoken",
    "corsheaders",
    "channels",
    "apps.accounts",
    "apps.services",
    "apps.payments",
    "apps.ads",
    "apps.ai",
    "apps.notifications",
    "apps.core",
]

MIDDLEWARE = [
    'whitenoise.middleware.WhiteNoiseMiddleware',
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "s_link_backend.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "s_link_backend.wsgi.application"
ASGI_APPLICATION = "s_link_backend.asgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("POSTGRES_DB", "s_link"),
        "USER": os.getenv("POSTGRES_USER", "s_link"),
        "PASSWORD": os.getenv("POSTGRES_PASSWORD", "s_link"),
        "HOST": os.getenv("POSTGRES_HOST", "localhost"),
        "PORT": os.getenv("POSTGRES_PORT", "5432"),
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

LANGUAGE_CODE = "en-us"

TIME_ZONE = "UTC"

USE_I18N = True

USE_TZ = True

STATIC_URL = '/static/'  # ✅ Added leading slash
STATIC_ROOT = BASE_DIR / 'staticfiles'
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"
DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticatedOrReadOnly",
    ),
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=30),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
}

CORS_ALLOW_ALL_ORIGINS = True

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [(os.getenv("REDIS_HOST", "localhost"), int(os.getenv("REDIS_PORT", "6379")))]
        },
    }
}

AUTH_USER_MODEL = "accounts.User"


REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))

# ---- SMS (Dayliff Bridge) ----
# Dayliff Bridge — same contract as Laravel sendRawSMS (D-Api-Key header).
SMS_URL = os.getenv("SMS_URL", "https://bridge.dayliff.com/v1/SMS/sendRawSMS")
SMS_API_KEY = os.getenv("SMS_API_KEY", "390f4bd8-f7e1-4c90-8a27-29729fa56c35")
SMS_COUNTRY = os.getenv("SMS_COUNTRY", "KENYA")
SMS_DRY_RUN = os.getenv("SMS_DRY_RUN", "false").lower() == "true"

# ---- Geofence / arrival / response timeouts ----
GEOFENCE_DEFAULT_RADIUS_KM = float(os.getenv("GEOFENCE_DEFAULT_RADIUS_KM", "10"))
GEOFENCE_MAX_RADIUS_KM = float(os.getenv("GEOFENCE_MAX_RADIUS_KM", "30"))
ARRIVAL_NOTIFICATION_METERS = float(os.getenv("ARRIVAL_NOTIFICATION_METERS", "500"))
PROVIDER_RESPONSE_TIMEOUT_MIN = int(os.getenv("PROVIDER_RESPONSE_TIMEOUT_MIN", "5"))

# ---- Live provider location ----
# How long a heartbeat from a provider is considered "live". Beyond this
# window the matcher treats them as offline (or falls back to base_lat/lng
# if PROVIDER_HEARTBEAT_FALLBACK_TO_BASE is true).
PROVIDER_HEARTBEAT_TTL_MIN = int(os.getenv("PROVIDER_HEARTBEAT_TTL_MIN", "5"))
PROVIDER_HEARTBEAT_FALLBACK_TO_BASE = os.getenv(
    "PROVIDER_HEARTBEAT_FALLBACK_TO_BASE", "false"
).lower() == "true"
# Drop providers from the admin live monitor map after this many minutes
# without a fresh GPS signal. Override per request via ?stale_after=N.
ADMIN_MONITOR_STALE_AFTER_MIN = int(os.getenv("ADMIN_MONITOR_STALE_AFTER_MIN", "10"))

# ---- Feature flags ----
# Set CONNECTION_FEE_ENABLED=true once you want to charge the customer the
# discovery / connection fee before they can view matched provider profiles.
# Defaults to OFF so the app launches without monetisation friction.
CONNECTION_FEE_ENABLED = os.getenv("CONNECTION_FEE_ENABLED", "false").lower() == "true"
CONNECTION_FEE_KES = int(os.getenv("CONNECTION_FEE_KES", "50"))


# ---- Logging ----
# Send our app loggers to stdout so `docker compose logs -f backend`
# (or `python manage.py runserver` in dev) shows live SMS, M-Pesa, and
# provider heartbeat activity.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "s_link": {
            "format": "[{asctime}] {levelname} {name}: {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "s_link",
        },
    },
    "loggers": {
        "s_link.services": {"handlers": ["console"], "level": "INFO", "propagate": False},
        "s_link.daraja": {"handlers": ["console"], "level": "INFO", "propagate": False},
        "s_link.sms": {"handlers": ["console"], "level": "INFO", "propagate": False},
        "s_link.gemini": {"handlers": ["console"], "level": "INFO", "propagate": False},
    },
    "root": {"handlers": ["console"], "level": "WARNING"},
}

# ---- M-Pesa (Daraja STK Push) ----
# Sandbox test credentials are pre-baked. Override via environment for production.
MPESA_ENV = os.getenv("MPESA_ENV", "sandbox")
MPESA_BASE_URL = (
    "https://sandbox.safaricom.co.ke"
    if MPESA_ENV == "sandbox"
    else "https://api.safaricom.co.ke"
)
MPESA_CONSUMER_KEY = os.getenv("MPESA_CONSUMER_KEY", "")
MPESA_CONSUMER_SECRET = os.getenv("MPESA_CONSUMER_SECRET", "")
MPESA_SHORTCODE = os.getenv("MPESA_SHORTCODE", "174379")
MPESA_PASSKEY = os.getenv(
    "MPESA_PASSKEY",
    "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919",
)
MPESA_TRANSACTION_TYPE = os.getenv(
    "MPESA_TRANSACTION_TYPE", "CustomerPayBillOnline"
)
MPESA_CALLBACK_URL = os.getenv(
    "MPESA_CALLBACK_URL",
    "https://example.com/api/payments/mpesa/callback/",
)
MPESA_INITIATOR_NAME = os.getenv("MPESA_INITIATOR_NAME", "testapi")
MPESA_INITIATOR_PASSWORD = os.getenv("MPESA_INITIATOR_PASSWORD", "Safaricom123!!")

CELERY_BROKER_URL = os.getenv(
    "CELERY_BROKER_URL", f"redis://{REDIS_HOST}:{REDIS_PORT}/0"
)
CELERY_RESULT_BACKEND = os.getenv(
    "CELERY_RESULT_BACKEND", f"redis://{REDIS_HOST}:{REDIS_PORT}/1"
)

