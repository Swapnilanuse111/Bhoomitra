from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('farmers', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='farmerprofile',
            name='avatar_data',
            field=models.TextField(blank=True),
        ),
    ]
