from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.core"

    def ready(self):
        # Connect the email delivery-event handlers (bounce/complaint suppression).
        from . import email_events  # noqa: F401
