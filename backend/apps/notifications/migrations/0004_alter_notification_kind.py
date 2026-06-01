from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('notifications', '0003_rename_notif_maint_shop_idx_notificatio_shop_id_b74431_idx_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='notification',
            name='kind',
            field=models.CharField(
                choices=[
                    ('booking_new', 'New booking'),
                    ('booking_confirmed', 'Booking confirmed'),
                    ('booking_cancelled', 'Booking cancelled'),
                    ('booking_completed', 'Booking completed'),
                    ('booking_no_show', 'Marked no-show'),
                    ('reminder', 'Reminder'),
                    ('chat.new_message', 'New chat message'),
                ],
                max_length=32,
            ),
        ),
    ]
