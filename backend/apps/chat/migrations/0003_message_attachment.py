from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("chat", "0002_rename_chat_chatpa_user_id_ad42b5_idx_chat_chatpa_user_id_c9de75_idx_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="message",
            name="body",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="message",
            name="attachment",
            field=models.FileField(blank=True, null=True, upload_to="chat/%Y/%m/"),
        ),
        migrations.AddField(
            model_name="message",
            name="attachment_kind",
            field=models.CharField(
                blank=True,
                choices=[("image", "Image"), ("video", "Video"), ("file", "File")],
                max_length=8,
            ),
        ),
        migrations.AddField(
            model_name="message",
            name="attachment_name",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="message",
            name="attachment_size",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="message",
            name="attachment_mime",
            field=models.CharField(blank=True, max_length=128),
        ),
    ]
