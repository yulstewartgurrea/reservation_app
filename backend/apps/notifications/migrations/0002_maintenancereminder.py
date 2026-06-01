import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("notifications", "0001_initial"),
        ("services", "0002_servicephoto"),
        ("shops", "0002_alter_favorite_options"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="MaintenanceReminder",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                (
                    "title",
                    models.CharField(help_text="Short label, e.g. 'Aircon cleaning'", max_length=120),
                ),
                (
                    "message",
                    models.TextField(blank=True, help_text="Optional custom note to include in the email."),
                ),
                ("interval_months", models.PositiveSmallIntegerField(default=6)),
                ("next_due_at", models.DateTimeField()),
                ("last_sent_at", models.DateTimeField(blank=True, null=True)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "customer",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="maintenance_reminders",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="maintenance_reminders_created",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "service",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="maintenance_reminders",
                        to="services.service",
                    ),
                ),
                (
                    "shop",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="maintenance_reminders",
                        to="shops.shop",
                    ),
                ),
            ],
            options={
                "ordering": ["next_due_at"],
                "indexes": [
                    models.Index(fields=["shop", "is_active"], name="notif_maint_shop_idx"),
                    models.Index(fields=["next_due_at", "is_active"], name="notif_maint_due_idx"),
                ],
            },
        ),
    ]
