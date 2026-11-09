from rest_framework import serializers

from .models import CropLogEntry, PhotoSchedule


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
        fields = (
            'id', 'date', 'day', 'title', 'description', 'photoUrl',
            'is_void', 'void_reason', 'voided_at', 'updated_at',
        )
        read_only_fields = ('id', 'is_void', 'void_reason', 'voided_at', 'updated_at')

    def validate(self, attrs):
        if self.instance is not None and not attrs:
            raise serializers.ValidationError('Provide at least one field to update.')
        return attrs


class CropLogVoidSerializer(serializers.Serializer):
    reason = serializers.CharField(allow_blank=True, required=False, trim_whitespace=True)


class PhotoScheduleSettingsSerializer(serializers.Serializer):
    crop = serializers.RegexField(r'^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$', required=False)
    interval_days = serializers.IntegerField(min_value=1, max_value=14, required=False)
    mode = serializers.ChoiceField(choices=PhotoSchedule.Mode.choices, required=False)

    def validate(self, attrs):
        if not attrs or set(attrs) == {'crop'}:
            raise serializers.ValidationError('Change the reminder interval or mode.')
        return attrs


class PhotoScheduleCropSerializer(serializers.Serializer):
    crop = serializers.RegexField(r'^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$', default='pomegranate')


class PhotoScheduleWeatherSerializer(serializers.Serializer):
    weather_codes = serializers.ListField(
        child=serializers.IntegerField(min_value=0, max_value=99),
        required=False,
        max_length=48,
    )
    humidity = serializers.FloatField(min_value=0, max_value=100, required=False)
    rain_chance = serializers.FloatField(min_value=0, max_value=100, required=False)


def parse_photo_schedule_weather(data):
    raw_codes = data.get('weather_codes')
    if isinstance(raw_codes, str):
        try:
            raw_codes = [int(code) for code in raw_codes.split(',') if code.strip()]
        except ValueError:
            raise serializers.ValidationError(
                {'weather_codes': ['Provide comma-separated weather codes from 0 to 99.']}
            ) from None
    elif raw_codes is None:
        raw_codes = []

    weather_data = {
        'weather_codes': raw_codes,
        'humidity': data.get('humidity'),
        'rain_chance': data.get('rain_chance'),
    }
    weather_data = {key: value for key, value in weather_data.items() if value not in (None, '')}
    if not weather_data:
        return None

    serializer = PhotoScheduleWeatherSerializer(data=weather_data)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data
