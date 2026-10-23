import uuid

from django.conf import settings
from django.db import models


class FarmerProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='farmer_profile',
    )
    name = models.CharField(max_length=80)
    avatar_data = models.TextField(blank=True)

    def __str__(self):
        return self.name


class CropLogEntry(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='crop_log_entries',
    )
    date = models.DateField()
    day = models.PositiveIntegerField()
    title = models.CharField(max_length=100)
    description = models.CharField(max_length=500)
    photo_data = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ('-date', '-created_at')

    def __str__(self):
        return self.title
