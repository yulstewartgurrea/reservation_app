from decimal import Decimal, ROUND_HALF_UP

from django.db import migrations, models


def backfill_unit_price(apps, schema_editor):
    """Derive per-unit price for pre-existing rows from total_price / quantity.

    Guard quantity == 0 (shouldn't happen, default is 1) by falling back to
    total_price so we never divide by zero and the invariant
    total_price == unit_price * quantity still holds for quantity 0/1.
    """
    Reservation = apps.get_model("reservations", "Reservation")
    for r in Reservation.objects.all().iterator():
        qty = r.quantity or 0
        if qty <= 1:
            unit = r.total_price
        else:
            unit = (r.total_price / qty).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
        Reservation.objects.filter(pk=r.pk).update(unit_price=unit)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("reservations", "0003_reservation_quantity"),
    ]

    operations = [
        migrations.AddField(
            model_name="reservation",
            name="unit_price",
            field=models.DecimalField(
                max_digits=10,
                decimal_places=2,
                null=True,
                help_text=(
                    "Price per unit frozen at booking time. The reservation's "
                    "price is snapshotted here so later Service.price changes "
                    "never alter an existing booking (keeps commission/revenue "
                    "historically correct). Invariant: total_price == "
                    "(unit_price * quantity).quantize('0.01')."
                ),
            ),
        ),
        migrations.RunPython(backfill_unit_price, noop_reverse),
        migrations.AlterField(
            model_name="reservation",
            name="unit_price",
            field=models.DecimalField(
                max_digits=10,
                decimal_places=2,
                help_text=(
                    "Price per unit frozen at booking time. The reservation's "
                    "price is snapshotted here so later Service.price changes "
                    "never alter an existing booking (keeps commission/revenue "
                    "historically correct). Invariant: total_price == "
                    "(unit_price * quantity).quantize('0.01')."
                ),
            ),
        ),
    ]
