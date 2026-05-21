from pathlib import Path
from datetime import timedelta
import environ
from celery.schedules import crontab

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env(
    DJANGO_DEBUG=(bool, False),
    DEFAULT_COMMISSION_RATE=(float, 0.15),
    DEFAULT_CANCELLATION_WINDOW_HOURS=(int, 24),
    STRIKE_LIMIT=(int, 3),
    STRIKE_WINDOW_DAYS=(int, 90),
    COMMISSION_INVOICE_DUE_DAYS=(int, 7),
    COMMISSION_INVOICE_GRACE_DAYS=(int, 7),
)
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("DJANGO_SECRET_KEY")
DEBUG = env("DJANGO_DEBUG")
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["*"])

INSTALLED_APPS = [
    "daphne",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",

    "rest_framework",
    "rest_framework_simplejwt",
    "corsheaders",
    "django_filters",
    "drf_spectacular",
    "channels",

    "apps.accounts",
    "apps.shops",
    "apps.services",
    "apps.reservations",
    "apps.reviews",
    "apps.notifications",
    "apps.admin_panel",
    "apps.payments",
    "apps.chat",
    "apps.core",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("POSTGRES_DB"),
        "USER": env("POSTGRES_USER"),
        "PASSWORD": env("POSTGRES_PASSWORD"),
        "HOST": env("POSTGRES_HOST"),
        "PORT": env("POSTGRES_PORT"),
    }
}

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
# Shop hours (WeekdayHours.open_time / close_time) are stored as naive
# `time` values that the shop owner enters in local time. `compute_slots`
# combines them with a date via `timezone.get_current_timezone()`, so this
# setting must match the operating region's offset. Storage stays UTC
# (USE_TZ=True); this only changes how local times are interpreted/displayed.
TIME_ZONE = env("DJANGO_TIME_ZONE", default="Asia/Manila")
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# Media storage — S3 with presigned URLs, everywhere.
#
# The bucket stays fully private (no public ACLs, no public bucket policy);
# every read goes through a time-limited signed URL generated server-side via
# either the ECS task's IAM role (in AWS) or the developer's AWS credentials
# (locally). AWS_STORAGE_BUCKET_NAME is required at startup so we fail loudly
# instead of silently writing to ephemeral container disk.
#
# Tests override this with InMemoryStorage in config/test_settings.py.
AWS_STORAGE_BUCKET_NAME = env("AWS_STORAGE_BUCKET_NAME")
STORAGES = {
    "default": {
        "BACKEND": "storages.backends.s3.S3Storage",
        "OPTIONS": {
            "bucket_name": AWS_STORAGE_BUCKET_NAME,
            "region_name": env("AWS_S3_REGION_NAME", default=env("AWS_REGION", default="ap-southeast-1")),
            # ap-southeast-1 only supports SigV4.
            "signature_version": "s3v4",
            # Bucket has BucketOwnerEnforced — per-object ACLs are disabled,
            # so we MUST NOT send one on PutObject.
            "default_acl": None,
            # Every URL is a presigned GET valid for 6 hours. Long enough
            # that an open tab keeps rendering; short enough that a leaked
            # URL has limited reach.
            "querystring_auth": True,
            "querystring_expire": 60 * 60 * 6,
            # Two users uploading "photo.jpg" get distinct keys instead of
            # one silently clobbering the other.
            "file_overwrite": False,
        },
    },
    "staticfiles": {
        "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
    },
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    # Rates for the per-endpoint throttles in apps/accounts/throttles.py. Only the
    # auth endpoints that attach those throttle classes are limited — there is no
    # DEFAULT_THROTTLE_CLASSES, so the rest of the API is unthrottled.
    "DEFAULT_THROTTLE_RATES": {
        "login": "5/min",
        "register": "5/hour",
        "password_reset": "5/hour",
    },
    # How many trusted proxies sit in front of the app. Required for IP-based
    # throttling to use the real client IP from X-Forwarded-For rather than the
    # proxy's address. None lets DRF take the first XFF entry. Tune per environment.
    "NUM_PROXIES": env.int("DRF_NUM_PROXIES", default=None),
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=60),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": False,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Reservation API",
    "DESCRIPTION": "Reservation platform API",
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=["http://localhost:3000"])
CORS_ALLOW_CREDENTIALS = True

REDIS_URL = env("REDIS_URL")

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {"hosts": [REDIS_URL]},
    },
}

CELERY_BROKER_URL = env("CELERY_BROKER_URL")
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND")

# AWS ElastiCache emits rediss:// URLs without SSL params, and Celery's redis
# result backend reads ssl options from this dict (NOT from URL query params).
# CERT_NONE is acceptable here — the wire is VPC-private and SG-locked, TLS
# still encrypts; we just skip CA-chain verification (ElastiCache certs aren't
# in Python's default trust store anyway).
if CELERY_BROKER_URL.startswith("rediss://") or CELERY_RESULT_BACKEND.startswith("rediss://"):
    import ssl as _ssl
    CELERY_BROKER_USE_SSL = {"ssl_cert_reqs": _ssl.CERT_NONE}
    CELERY_REDIS_BACKEND_USE_SSL = {"ssl_cert_reqs": _ssl.CERT_NONE}
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = "UTC"

CELERY_BEAT_SCHEDULE = {
    "auto-mark-no-shows": {
        "task": "apps.reservations.tasks.auto_mark_no_shows",
        "schedule": 300.0,  # every 5 minutes
    },
    "decay-strikes": {
        "task": "apps.reservations.tasks.decay_strikes",
        "schedule": 3600.0,  # hourly
    },
    "dispatch-maintenance-reminders": {
        "task": "apps.notifications.tasks.dispatch_due_maintenance_reminders",
        "schedule": 3600.0,  # hourly is plenty for "due in 6 months" cadences
    },
    "dispatch-reservation-reminders": {
        "task": "apps.reservations.tasks.dispatch_due_reminders",
        "schedule": 600.0,  # every 10 min; < REMINDER_LATE_GRACE so none are missed
    },
    "generate-monthly-commission-invoices": {
        "task": "apps.reservations.tasks.generate_monthly_commission_invoices",
        # 1st of each month, 02:00 UTC — bills the *previous* calendar month.
        "schedule": crontab(day_of_month=1, hour=2, minute=0),
    },
    "process-overdue-commission-invoices": {
        "task": "apps.reservations.tasks.process_overdue_commission_invoices",
        # Daily 03:00 UTC: escalating reminders + auto-pause after grace.
        "schedule": crontab(hour=3, minute=0),
    },
}

EMAIL_BACKEND = env("EMAIL_BACKEND", default="django.core.mail.backends.console.EmailBackend")
EMAIL_HOST = env("EMAIL_HOST", default="")
EMAIL_PORT = env.int("EMAIL_PORT", default=587)
EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")
EMAIL_USE_TLS = env.bool("EMAIL_USE_TLS", default=True)
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="BookMe <noreply@bookme.local>")

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "console": {"class": "logging.StreamHandler"},
    },
    "loggers": {
        "apps": {"handlers": ["console"], "level": "INFO", "propagate": False},
    },
}

FRONTEND_URL = env("FRONTEND_URL", default="http://localhost:3000")

DEFAULT_COMMISSION_RATE = env("DEFAULT_COMMISSION_RATE")
DEFAULT_CANCELLATION_WINDOW_HOURS = env("DEFAULT_CANCELLATION_WINDOW_HOURS")
STRIKE_LIMIT = env("STRIKE_LIMIT")
STRIKE_WINDOW_DAYS = env("STRIKE_WINDOW_DAYS")

# Monthly commission invoicing: days from issue to due, then a grace period
# after due before the shop's new bookings are auto-paused until paid.
COMMISSION_INVOICE_DUE_DAYS = env("COMMISSION_INVOICE_DUE_DAYS")
COMMISSION_INVOICE_GRACE_DAYS = env("COMMISSION_INVOICE_GRACE_DAYS")

PAYMONGO_SECRET_KEY = env("PAYMONGO_SECRET_KEY", default="")
PAYMONGO_PUBLIC_KEY = env("PAYMONGO_PUBLIC_KEY", default="")
PAYMONGO_WEBHOOK_SECRET = env("PAYMONGO_WEBHOOK_SECRET", default="")
