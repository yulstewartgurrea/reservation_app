from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0004_user_last_seen_at"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="email_bounced",
            field=models.BooleanField(default=False),
        ),
    ]
