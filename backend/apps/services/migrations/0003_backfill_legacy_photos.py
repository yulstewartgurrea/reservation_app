"""Backfill `Service.photo` → ServicePhoto rows.

Before the ServicePhoto gallery existed, services kept their single cover on
the `Service.photo` ImageField. New uploads now go to `ServicePhoto` rows, but
older services still have their image on the legacy field with an empty
gallery — that's why the Edit Service page looks photo-less even though the
dashboard card shows a cover (the serializer's `cover_photo` field falls
back to the legacy column).

This migration creates a single `ServicePhoto` row (sort_order=0) from
`Service.photo` for every service that has a legacy photo and no gallery
rows yet. The legacy column itself is left intact so we don't risk losing
data if something downstream still references it.
"""

from django.db import migrations


def backfill(apps, schema_editor):
    Service = apps.get_model("services", "Service")
    ServicePhoto = apps.get_model("services", "ServicePhoto")

    # Only act on services that have a legacy photo AND no gallery rows.
    services = (
        Service.objects.exclude(photo="")
        .exclude(photo=None)
        .filter(gallery__isnull=True)
        .distinct()
    )
    for svc in services:
        if not svc.photo:
            continue
        ServicePhoto.objects.create(
            service=svc,
            image=svc.photo.name,  # reuse the existing file path; no copy needed
            sort_order=0,
        )


def noop_reverse(apps, schema_editor):
    """Reversal is a no-op — we don't want to delete user data on unmigrate.

    The forward migration is idempotent (only creates when gallery is empty),
    so re-running it after a reversal is safe.
    """


class Migration(migrations.Migration):
    dependencies = [
        ("services", "0002_servicephoto"),
    ]

    operations = [
        migrations.RunPython(backfill, noop_reverse),
    ]
