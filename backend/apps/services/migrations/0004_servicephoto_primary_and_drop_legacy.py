"""Promote one `ServicePhoto` per service to primary, then drop `Service.photo`.

Operations:
1. Add `ServicePhoto.is_primary` (default False).
2. Backfill: for each service that has gallery rows, mark the first one
   (current ordering: sort_order, id) as primary.
3. Add a partial unique constraint so at most one primary photo per service.
4. Drop the legacy `Service.photo` ImageField.

Migration 0003 already copied any legacy `Service.photo` file into a
`ServicePhoto` row, so dropping the column is safe — no file paths are lost.
"""

from django.db import migrations, models


def mark_first_photo_primary(apps, schema_editor):
    Service = apps.get_model("services", "Service")
    ServicePhoto = apps.get_model("services", "ServicePhoto")

    for svc in Service.objects.all():
        first = (
            ServicePhoto.objects.filter(service=svc)
            .order_by("sort_order", "id")
            .first()
        )
        if first and not first.is_primary:
            first.is_primary = True
            first.save(update_fields=["is_primary"])


def unmark_all_primary(apps, schema_editor):
    """Reverse: clear primary flags so the field can be safely removed."""
    ServicePhoto = apps.get_model("services", "ServicePhoto")
    ServicePhoto.objects.filter(is_primary=True).update(is_primary=False)


class Migration(migrations.Migration):
    dependencies = [
        ("services", "0003_backfill_legacy_photos"),
    ]

    operations = [
        migrations.AddField(
            model_name="servicephoto",
            name="is_primary",
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(mark_first_photo_primary, unmark_all_primary),
        migrations.AddConstraint(
            model_name="servicephoto",
            constraint=models.UniqueConstraint(
                fields=("service",),
                condition=models.Q(is_primary=True),
                name="unique_primary_photo_per_service",
            ),
        ),
        migrations.AlterModelOptions(
            name="servicephoto",
            options={"ordering": ["-is_primary", "sort_order", "id"]},
        ),
        migrations.RemoveField(
            model_name="service",
            name="photo",
        ),
    ]
