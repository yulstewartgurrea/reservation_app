from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("shops", "0003_staff_email_staff_phone"),
    ]

    operations = [
        migrations.AddField(
            model_name="shop",
            name="address_line_2",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="shop",
            name="state_province",
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name="shop",
            name="barangay",
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name="shop",
            name="landmark",
            field=models.CharField(blank=True, max_length=255),
        ),
    ]
