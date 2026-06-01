"""Backfill the new Resource scheduling unit onto existing data.

Before this change, capacity was governed per-staff. To avoid silently
shrinking any live shop's parallel capacity, each shop is seeded with
``max(1, active_staff_count)`` Resources, then every existing reservation is
greedily assigned to a Resource that none of its time-overlapping neighbours
already hold. Greedy interval-colouring never collides because the old data was
itself conflict-free per staff; if it ever needs more colours than the seed
pool, extra Resources are created on demand. Cancelled / no-show reservations
still receive a Resource but do not occupy capacity.
"""

from django.db import migrations

BLOCKING = ("pending", "confirmed", "completed")


def backfill(apps, schema_editor):
    Shop = apps.get_model("shops", "Shop")
    Resource = apps.get_model("shops", "Resource")
    Staff = apps.get_model("shops", "Staff")
    Reservation = apps.get_model("reservations", "Reservation")

    for shop in Shop.objects.all().iterator():
        label = shop.resource_label or "Station"
        staff_count = Staff.objects.filter(shop=shop, is_active=True).count()
        pool_size = max(1, staff_count)
        resources = [
            Resource.objects.create(shop=shop, name=f"{label} {i}")
            for i in range(1, pool_size + 1)
        ]

        # (start_at, end_at, resource_id) of already-assigned blocking rows.
        occupied = []
        reservations = Reservation.objects.filter(shop=shop).order_by("start_at", "id")
        for r in reservations.iterator():
            used = {
                rid
                for (s, e, rid) in occupied
                if s < r.end_at and e > r.start_at
            }
            free = [res for res in resources if res.id not in used]
            if free:
                res = free[0]
            else:
                res = Resource.objects.create(
                    shop=shop, name=f"{label} {len(resources) + 1}"
                )
                resources.append(res)
            r.resource = res
            r.save(update_fields=["resource"])
            if r.status in BLOCKING:
                occupied.append((r.start_at, r.end_at, res.id))


class Migration(migrations.Migration):

    dependencies = [
        ("reservations", "0006_reservation_resource"),
        ("shops", "0006_shop_resource_label_alter_timeblock_staff_resource_and_more"),
    ]

    operations = [
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
