import uuid
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone

from .photo_schedule import NORMAL_INTERVAL_DAYS


def default_photo_schedule_due_at():
    return timezone.now() + timedelta(days=NORMAL_INTERVAL_DAYS)


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
    is_void = models.BooleanField(default=False)
    void_reason = models.TextField(blank=True)
    voided_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ('-date', '-created_at')

    def __str__(self):
        return self.title


class PhotoSchedule(models.Model):
    class Mode(models.TextChoices):
        AUTO = 'auto', 'Automatic'
        MANUAL = 'manual', 'Manual'

    class Reason(models.TextChoices):
        NORMAL = 'normal', 'Normal'
        RAINY = 'rainy', 'Rainy forecast'
        CLOUDY = 'cloudy', 'Cloudy forecast'
        HUMID = 'humid', 'Humid forecast'
        FLOWERING = 'flowering', 'Flowering stage'
        FRUITING = 'fruiting', 'Fruiting stage'
        SYMPTOM = 'symptom', 'High-confidence symptom'
        MANUAL = 'manual', 'Manual interval'

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='photo_schedules',
    )
    crop = models.CharField(max_length=80)
    interval_days = models.PositiveSmallIntegerField(default=NORMAL_INTERVAL_DAYS)
    last_photo_at = models.DateTimeField(null=True, blank=True)
    next_due_at = models.DateTimeField(default=default_photo_schedule_due_at)
    mode = models.CharField(max_length=10, choices=Mode.choices, default=Mode.AUTO)
    reason = models.CharField(max_length=12, choices=Reason.choices, default=Reason.NORMAL)
    last_analysis_was_diseased = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=('user', 'crop'), name='unique_photo_schedule_user_crop'),
        ]

    def __str__(self):
        return f'{self.crop} photo schedule for {self.user}'
