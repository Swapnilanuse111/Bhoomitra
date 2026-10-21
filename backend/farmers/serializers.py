from rest_framework import serializers

from .models import CropLogEntry


class CropLogEntrySerializer(serializers.ModelSerializer):
    photoUrl = serializers.CharField(
        source='photo_data',
        max_length=3_000_000,
        allow_blank=True,
        required=False,
    )

    class Meta:
        model = CropLogEntry
        fields = ('id', 'date', 'day', 'title', 'description', 'photoUrl')
        read_only_fields = ('id',)
