from rest_framework import serializers

from .models import CropLogEntry


class FarmerProfileSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=80, trim_whitespace=True)
    email = serializers.EmailField(max_length=254)
    avatarData = serializers.CharField(
        source='avatar_data',
        max_length=3_000_000,
        allow_blank=True,
        required=False,
    )


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
