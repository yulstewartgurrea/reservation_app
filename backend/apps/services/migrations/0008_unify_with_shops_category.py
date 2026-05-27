from django.db import migrations, models


def remap_service_category_to_shops_category(apps, schema_editor):
    """Best-effort remap of `Service.category` from the old `ServiceCategory`
    table to the new unified `shops.Category` table.

    Strategy:
      * For each surviving `ServiceCategory` row whose name (or slug) matches
        a `shops.Category`, copy the matching category's id onto every Service
        that referenced it.
      * Services whose old category has no match get nulled out — the FK is
        `null=True, on_delete=SET_NULL`, so they remain valid rows that the
        owner can re-tag from the unified list.

    After this RunPython completes the FK column still physically references
    rows in `services_servicecategory` (since we haven't altered it yet);
    the subsequent `AlterField` swaps the target table, and the ids on the
    column already point to `shops.Category` rows so no FK is left dangling.
    """

    Service = apps.get_model("services", "Service")
    ServiceCategory = apps.get_model("services", "ServiceCategory")
    Category = apps.get_model("shops", "Category")

    # Build a lookup of unified categories by lowercased name and by slug.
    by_name = {c.name.lower(): c.id for c in Category.objects.all()}
    by_slug = {c.slug: c.id for c in Category.objects.all()}

    for old_cat in ServiceCategory.objects.all():
        target_id = by_slug.get(old_cat.slug) or by_name.get(old_cat.name.lower())
        if target_id is not None:
            Service.objects.filter(category_id=old_cat.id).update(
                category_id=target_id
            )
        else:
            Service.objects.filter(category_id=old_cat.id).update(
                category_id=None
            )


def noop_reverse(apps, schema_editor):
    """No reverse — old ServiceCategory rows are dropped by the AlterField/
    DeleteModel below, so the original mapping cannot be restored."""

    return None


class Migration(migrations.Migration):
    """Drop the per-app `ServiceCategory` model and repoint `Service.category`
    to the unified `shops.Category` table (renamed from `ShopCategory` in
    shops/0008). Customer-facing `/api/services/categories/` keeps working —
    its viewset now serves the unified table."""

    dependencies = [
        ("services", "0007_service_inter_unit_buffer_minutes"),
        ("shops", "0008_rename_shopcategory_to_category"),
    ]

    operations = [
        migrations.RunPython(
            remap_service_category_to_shops_category,
            reverse_code=noop_reverse,
        ),
        migrations.AlterField(
            model_name="service",
            name="category",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.deletion.SET_NULL,
                related_name="services",
                to="shops.category",
            ),
        ),
        migrations.DeleteModel(
            name="ServiceCategory",
        ),
    ]
