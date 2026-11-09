from datetime import timedelta
from django.utils import timezone

NORMAL_INTERVAL_DAYS = 5
RAINY_INTERVAL_DAYS = 2
CLOUDY_INTERVAL_DAYS = 3
HUMID_INTERVAL_DAYS = 3
FLOWERING_INTERVAL_DAYS = 4
FRUITING_INTERVAL_DAYS = 3
SYMPTOM_INTERVAL_DAYS = 3
HIGH_CONFIDENCE_THRESHOLD = 0.70
HUMIDITY_THRESHOLD = 80
RAIN_CHANCE_THRESHOLD = 50

RAINY_WEATHER_CODES = frozenset((*range(51, 68), *range(80, 83), *range(95, 100)))
CLOUDY_WEATHER_CODES = frozenset((2, 3))

FLOWERING_TERMS = ("flowering", "bloom", "फुलोरा", "फुलोऱ्या", "फुल", "फूल", "खिल")
FRUITING_TERMS = ("fruiting", "fruit set", "फळधारणा", "फळधरणा", "फळ ये", "फलन", "फल लग")


def detect_crop_stage(entries):
    for entry in entries:
        text = f"{entry.title} {entry.description}".casefold()
        if any(term in text for term in FRUITING_TERMS):
            return "fruiting"
        if any(term in text for term in FLOWERING_TERMS):
            return "flowering"
    return None


def get_weather_reason(weather):
    if not weather:
        return None

    weather_codes = weather.get("weather_codes", ())
    rain_chance = weather.get("rain_chance")
    humidity = weather.get("humidity")

    if any(code in RAINY_WEATHER_CODES for code in weather_codes) or (
        rain_chance is not None and rain_chance >= RAIN_CHANCE_THRESHOLD
    ):
        return "rainy", RAINY_INTERVAL_DAYS
    if any(code in CLOUDY_WEATHER_CODES for code in weather_codes):
        return "cloudy", CLOUDY_INTERVAL_DAYS
    if humidity is not None and humidity >= HUMIDITY_THRESHOLD:
        return "humid", HUMID_INTERVAL_DAYS
    return None


def calculate_photo_interval(*, mode, interval_days, disease_result=False, entries=(), weather=None):
    if mode == "manual":
        return interval_days, "manual"
    if disease_result:
        return SYMPTOM_INTERVAL_DAYS, "symptom"

    weather_reason = get_weather_reason(weather)
    if weather_reason:
        return weather_reason[1], weather_reason[0]

    stage = detect_crop_stage(entries)
    if stage == "flowering":
        return FLOWERING_INTERVAL_DAYS, "flowering"
    if stage == "fruiting":
        return FRUITING_INTERVAL_DAYS, "fruiting"
    return NORMAL_INTERVAL_DAYS, "normal"


def recompute_photo_schedule(schedule, *, entries=(), weather=None):
    interval_days, reason = calculate_photo_interval(
        mode=schedule.mode,
        interval_days=schedule.interval_days,
        disease_result=schedule.last_analysis_was_diseased,
        entries=entries,
        weather=weather,
    )
    schedule.interval_days = interval_days
    schedule.reason = reason
    anchor = schedule.last_photo_at or schedule.created_at
    schedule.next_due_at = anchor + timedelta(days=interval_days)
    schedule.save(update_fields=(
        'interval_days',
        'reason',
        'next_due_at',
        'last_photo_at',
        'last_analysis_was_diseased',
    ))
    return schedule


def photo_schedule_payload(schedule):
    now = timezone.now()
    today = timezone.localdate(now)
    due_date = timezone.localtime(schedule.next_due_at).date()
    days_left = (due_date - today).days
    if days_left < 0:
        status = 'overdue'
    elif days_left == 0:
        status = 'due_today'
    else:
        status = 'ok'
    return {
        'crop': schedule.crop,
        'interval_days': schedule.interval_days,
        'last_photo_at': schedule.last_photo_at,
        'next_due_at': schedule.next_due_at,
        'days_left': days_left,
        'status': status,
        'reason': schedule.reason,
        'mode': schedule.mode,
    }


def record_photo_analysis(*, user, crop, analysis, weather=None):
    from .models import CropLogEntry, PhotoSchedule

    schedule, _ = PhotoSchedule.objects.get_or_create(user=user, crop=crop)
    label = str(analysis.get('label', '')).casefold()
    confidence = analysis.get('confidence', 0)
    schedule.last_analysis_was_diseased = (
        label not in {'healthy', 'healthy plant', 'निरोगी'}
        and isinstance(confidence, (int, float))
        and confidence >= HIGH_CONFIDENCE_THRESHOLD
        and not analysis.get('uncertain', False)
    )
    schedule.last_photo_at = timezone.now()
    entries = CropLogEntry.objects.filter(user=user, is_void=False).order_by('-date', '-created_at')
    recompute_photo_schedule(schedule, entries=entries, weather=weather)
    return schedule
