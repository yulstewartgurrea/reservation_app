"""Test settings: SQLite in-memory DB, in-memory channel layer, eager Celery, console email."""

import os

# Tests must not touch real S3. settings.py requires AWS_STORAGE_BUCKET_NAME
# at import time, so set a stub before the parent import — it's only used to
# satisfy env() validation and is immediately replaced by InMemoryStorage below.
os.environ.setdefault("AWS_STORAGE_BUCKET_NAME", "test-bucket-unused")

from .settings import *  # noqa: E402, F401, F403

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}

CHANNEL_LAYERS = {
    "default": {"BACKEND": "channels.layers.InMemoryChannelLayer"},
}

CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True

EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

# No S3 in tests — uploads live in process memory and disappear when the
# test process exits.
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.InMemoryStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}
