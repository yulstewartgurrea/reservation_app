from django.db import migrations


class Migration(migrations.Migration):
    """Rename `ShopCategory` -> `Category` to host the unified taxonomy used
    by both shops (M:N) and services (FK, repointed in services/0008)."""

    dependencies = [
        ("shops", "0007_shop_barangay_code_shop_city_code_shop_province_code"),
    ]

    operations = [
        migrations.RenameModel(
            old_name="ShopCategory",
            new_name="Category",
        ),
        migrations.AlterModelOptions(
            name="category",
            options={"ordering": ["name"], "verbose_name_plural": "Categories"},
        ),
    ]
