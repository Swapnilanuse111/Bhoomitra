import base64
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import patch

from PIL import Image
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from .models import CropLogEntry, FarmerProfile, PhotoSchedule
from .photo_schedule import calculate_photo_interval


class FarmerApiTests(TestCase):
    def setUp(self):
        self.client = APIClient(enforce_csrf_checks=True)
        self.client.get('/api/auth/csrf/')
        self.csrf_token = self.client.cookies['csrftoken'].value

    def test_csrf_endpoint_returns_token_and_sets_cookie(self):
        response = self.client.get('/api/auth/csrf/')

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['csrfToken'])
        self.assertIn('csrftoken', response.cookies)

    def post(self, url, data):
        return self.client.post(
            url,
            data,
            format='json',
            HTTP_X_CSRFTOKEN=self.csrf_token,
        )

    def test_registration_creates_account_and_profile(self):
        response = self.post(
            '/api/auth/register/',
            {
                'name': 'Aarav Patil',
                'email': 'aarav@example.com',
                'password': 'SafePassword!2026',
            },
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['name'], 'Aarav Patil')
        user = get_user_model().objects.get(email='aarav@example.com')
        self.assertTrue(user.check_password('SafePassword!2026'))
        self.assertEqual(FarmerProfile.objects.get(user=user).name, 'Aarav Patil')
        self.assertEqual(self.client.get('/api/auth/me/').data['user']['email'], user.email)

    def test_login_rejects_incorrect_password(self):
        get_user_model().objects.create_user(
            username='farmer@example.com',
            email='farmer@example.com',
            password='SafePassword!2026',
        )

        response = self.post(
            '/api/auth/login/',
            {'email': 'farmer@example.com', 'password': 'incorrect'},
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.data)

    def test_profile_requires_authentication(self):
        response = self.client.get('/api/auth/profile/')

        self.assertEqual(response.status_code, 403)

    def test_profile_update_changes_only_supported_user_fields(self):
        registration = self.post(
            '/api/auth/register/',
            {
                'name': 'Aarav Patil',
                'email': 'aarav@example.com',
                'password': 'SafePassword!2026',
            },
        )
        self.assertEqual(registration.status_code, 201)
        self.client.get('/api/auth/csrf/')
        self.csrf_token = self.client.cookies['csrftoken'].value

        csrf_rejected = self.client.put(
            '/api/auth/profile/',
            {'name': 'Aarav Updated', 'email': 'aarav.updated@example.com'},
            format='json',
        )
        self.assertEqual(csrf_rejected.status_code, 403)

        image_buffer = BytesIO()
        Image.new('RGB', (2, 2), color='green').save(image_buffer, format='PNG')
        avatar_data = 'data:image/png;base64,' + base64.b64encode(image_buffer.getvalue()).decode()
        response = self.client.put(
            '/api/auth/profile/',
            {
                'name': 'Aarav Updated',
                'email': 'aarav.updated@example.com',
                'avatarData': avatar_data,
                'is_staff': True,
            },
            format='json',
            HTTP_X_CSRFTOKEN=self.csrf_token,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['name'], 'Aarav Updated')
        self.assertEqual(response.data['email'], 'aarav.updated@example.com')
        self.assertEqual(response.data['avatarData'], avatar_data)
        user = get_user_model().objects.get(email='aarav.updated@example.com')
        self.assertEqual(user.username, 'aarav.updated@example.com')
        self.assertFalse(user.is_staff)
        self.assertEqual(user.farmer_profile.avatar_data, avatar_data)

    def test_profile_rejects_invalid_avatar_and_duplicate_email(self):
        first_user = get_user_model().objects.create_user(
            username='first@example.com',
            email='first@example.com',
            password='SafePassword!2026',
        )
        FarmerProfile.objects.create(user=first_user, name='First Farmer')
        get_user_model().objects.create_user(
            username='second@example.com',
            email='second@example.com',
            password='SafePassword!2026',
        )
        self.client.force_authenticate(user=first_user)
        duplicate_email = self.client.put(
            '/api/auth/profile/',
            {
                'name': 'First Farmer',
                'email': 'second@example.com',
            },
            format='json',
            HTTP_X_CSRFTOKEN=self.csrf_token,
        )

        self.assertEqual(duplicate_email.status_code, 400)
        self.assertIn('email', duplicate_email.data)
        invalid_avatar = self.client.put(
            '/api/auth/profile/',
            {
                'name': 'First Farmer',
                'email': 'first@example.com',
                'avatarData': 'not-an-image',
            },
            format='json',
            HTTP_X_CSRFTOKEN=self.csrf_token,
        )
        self.assertEqual(invalid_avatar.status_code, 400)
        self.assertIn('avatarData', invalid_avatar.data)
        self.assertEqual(first_user.email, 'first@example.com')

    def test_password_change_validates_current_password_and_keeps_session(self):
        registration = self.post(
            '/api/auth/register/',
            {
                'name': 'Aarav Patil',
                'email': 'aarav@example.com',
                'password': 'SafePassword!2026',
            },
        )
        self.assertEqual(registration.status_code, 201)
        self.client.get('/api/auth/csrf/')
        self.csrf_token = self.client.cookies['csrftoken'].value

        csrf_rejected = self.client.post(
            '/api/auth/password/',
            {
                'currentPassword': 'SafePassword!2026',
                'newPassword': 'FarmSeason!2030',
                'confirmPassword': 'FarmSeason!2030',
            },
            format='json',
        )
        self.assertEqual(csrf_rejected.status_code, 403)

        wrong_current_password = self.post(
            '/api/auth/password/',
            {
                'currentPassword': 'wrong',
                'newPassword': 'FarmSeason!2030',
                'confirmPassword': 'FarmSeason!2030',
            },
        )
        self.assertEqual(wrong_current_password.status_code, 400)
        self.assertIn('currentPassword', wrong_current_password.data)

        response = self.post(
            '/api/auth/password/',
            {
                'currentPassword': 'SafePassword!2026',
                'newPassword': 'FarmSeason!2030',
                'confirmPassword': 'FarmSeason!2030',
            },
        )

        self.assertEqual(response.status_code, 200)
        user = get_user_model().objects.get(email='aarav@example.com')
        self.assertTrue(user.check_password('FarmSeason!2030'))
        self.assertFalse(user.check_password('SafePassword!2026'))
        self.assertEqual(self.client.get('/api/auth/me/').data['user']['email'], 'aarav@example.com')

    def test_crop_log_requires_authentication_and_is_user_scoped(self):
        unauthenticated = self.client.get('/api/crop-log/')
        self.assertEqual(unauthenticated.status_code, 403)

        first_user = get_user_model().objects.create_user(
            username='first@example.com',
            email='first@example.com',
            password='SafePassword!2026',
        )
        first_user.farmer_profile = FarmerProfile.objects.create(
            user=first_user,
            name='First Farmer',
        )
        self.client.force_authenticate(user=first_user)
        created = self.client.post(
            '/api/crop-log/',
            {
                'date': '2026-10-21',
                'day': 1,
                'title': 'Field inspection',
                'description': 'Checked the field.',
                'photoUrl': '',
            },
            format='json',
        )
        self.assertEqual(created.status_code, 201)
        self.assertEqual(CropLogEntry.objects.filter(user=first_user).count(), 1)

        second_user = get_user_model().objects.create_user(
            username='second@example.com',
            email='second@example.com',
            password='SafePassword!2026',
        )
        self.client.force_authenticate(user=second_user)
        self.assertEqual(self.client.get('/api/crop-log/').data, [])

    def test_crop_log_can_be_edited_voided_and_restored(self):
        user = get_user_model().objects.create_user(
            username='crop-edit@example.com',
            email='crop-edit@example.com',
            password='SafePassword!2026',
        )
        self.client.force_authenticate(user=user)
        created = self.client.post(
            '/api/crop-log/',
            {
                'date': '2026-10-21',
                'day': 1,
                'title': 'Field inspection',
                'description': 'Checked the field.',
            },
            format='json',
        )
        entry_url = f"/api/crop-log/{created.data['id']}/"

        edited = self.client.patch(
            entry_url,
            {'description': 'Checked the north field.'},
            format='json',
        )
        self.assertEqual(edited.status_code, 200)
        self.assertEqual(edited.data['description'], 'Checked the north field.')
        self.assertFalse(edited.data['is_void'])

        voided = self.client.post(
            f"{entry_url}void/",
            {'reason': 'Duplicate entry'},
            format='json',
        )
        self.assertEqual(voided.status_code, 200)
        self.assertTrue(voided.data['is_void'])
        self.assertEqual(voided.data['void_reason'], 'Duplicate entry')
        self.assertIsNotNone(voided.data['voided_at'])
        self.assertEqual(self.client.get('/api/crop-log/').data, [])
        self.assertEqual(len(self.client.get('/api/crop-log/?include_void=1').data), 1)

        restored = self.client.post(f"{entry_url}restore/", {}, format='json')
        self.assertEqual(restored.status_code, 200)
        self.assertFalse(restored.data['is_void'])
        self.assertEqual(restored.data['void_reason'], '')
        self.assertEqual(len(self.client.get('/api/crop-log/').data), 1)

    def test_crop_log_edit_is_validated_and_user_scoped(self):
        owner = get_user_model().objects.create_user(
            username='crop-owner@example.com',
            email='crop-owner@example.com',
            password='SafePassword!2026',
        )
        entry = CropLogEntry.objects.create(
            user=owner,
            date='2026-10-21',
            day=1,
            title='Field inspection',
            description='Checked the field.',
        )
        other_user = get_user_model().objects.create_user(
            username='crop-other@example.com',
            email='crop-other@example.com',
            password='SafePassword!2026',
        )
        self.client.force_authenticate(user=other_user)

        self.assertEqual(self.client.patch(f'/api/crop-log/{entry.id}/', {'title': 'Changed'}).status_code, 404)

        self.client.force_authenticate(user=owner)
        empty_update = self.client.patch(f'/api/crop-log/{entry.id}/', {}, format='json')
        self.assertEqual(empty_update.status_code, 400)
        self.assertIn('Provide at least one field', str(empty_update.data))


class PhotoScheduleRuleTests(SimpleTestCase):
    def test_normal_weather_uses_five_days(self):
        self.assertEqual(
            calculate_photo_interval(mode='auto', interval_days=5),
            (5, 'normal'),
        )

    def test_rainy_cloudy_and_humid_forecasts_shorten_the_interval(self):
        self.assertEqual(
            calculate_photo_interval(mode='auto', interval_days=5, weather={'weather_codes': [61]}),
            (2, 'rainy'),
        )
        self.assertEqual(
            calculate_photo_interval(mode='auto', interval_days=5, weather={'weather_codes': [3]}),
            (3, 'cloudy'),
        )
        self.assertEqual(
            calculate_photo_interval(mode='auto', interval_days=5, weather={'humidity': 85}),
            (3, 'humid'),
        )

    def test_flowering_and_fruiting_crop_log_stages_use_shorter_intervals(self):
        flowering = SimpleNamespace(title='Flowering started', description='')
        fruiting = SimpleNamespace(title='Field note', description='Fruit set is visible')
        self.assertEqual(
            calculate_photo_interval(mode='auto', interval_days=5, entries=[flowering]),
            (4, 'flowering'),
        )
        self.assertEqual(
            calculate_photo_interval(mode='auto', interval_days=5, entries=[fruiting]),
            (3, 'fruiting'),
        )

    def test_high_confidence_symptoms_take_priority_and_manual_mode_is_respected(self):
        self.assertEqual(
            calculate_photo_interval(
                mode='auto',
                interval_days=5,
                disease_result=True,
                weather={'weather_codes': [61]},
            ),
            (3, 'symptom'),
        )
        self.assertEqual(
            calculate_photo_interval(
                mode='manual',
                interval_days=11,
                disease_result=True,
                weather={'weather_codes': [61]},
            ),
            (11, 'manual'),
        )


class PhotoScheduleApiTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username='schedule@example.com',
            email='schedule@example.com',
            password='SafePassword!2026',
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_schedule_requires_authentication_and_is_crop_scoped(self):
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.get('/api/plant-health/schedule/').status_code, 403)
        self.client.force_authenticate(user=self.user)

        response = self.client.get('/api/plant-health/schedule/?crop=tomato')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['interval_days'], 5)
        self.assertEqual(response.data['status'], 'ok')
        self.assertEqual(response.data['reason'], 'normal')
        self.assertEqual(PhotoSchedule.objects.filter(user=self.user).count(), 1)
        other_user = get_user_model().objects.create_user(
            username='another-schedule@example.com',
            email='another-schedule@example.com',
            password='SafePassword!2026',
        )
        PhotoSchedule.objects.create(user=other_user, crop='tomato')
        self.assertEqual(PhotoSchedule.objects.filter(crop='tomato').count(), 2)

    def test_patch_validates_range_and_persists_manual_setting(self):
        invalid = self.client.patch(
            '/api/plant-health/schedule/?crop=tomato',
            {'interval_days': 15, 'mode': 'manual'},
            format='json',
        )
        self.assertEqual(invalid.status_code, 400)
        self.assertIn('interval_days', invalid.data)

        saved = self.client.patch(
            '/api/plant-health/schedule/?crop=tomato',
            {'interval_days': 8},
            format='json',
        )
        self.assertEqual(saved.status_code, 200)
        self.assertEqual(saved.data['interval_days'], 8)
        self.assertEqual(saved.data['mode'], 'manual')
        self.assertEqual(saved.data['reason'], 'manual')

    def test_weather_query_updates_auto_interval(self):
        response = self.client.get(
            '/api/plant-health/schedule/?crop=tomato&weather_codes=61,3&humidity=90'
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['interval_days'], 2)
        self.assertEqual(response.data['reason'], 'rainy')

    def test_invalid_weather_context_returns_field_errors(self):
        response = self.client.get(
            '/api/plant-health/schedule/?crop=tomato&humidity=101'
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('humidity', response.data)

    def test_analysis_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.post('/api/plant-health/analyze/', {}, format='multipart')
        self.assertEqual(response.status_code, 403)

    @patch('plant_disease.views.predict_disease')
    def test_successful_analysis_updates_last_photo_and_next_due(self, predict):
        predict.return_value = {
            'label': 'diseased',
            'confidence': 0.92,
            'uncertain': False,
            'scores': {'diseased': 0.92, 'healthy': 0.08},
        }
        image_buffer = BytesIO()
        Image.new('RGB', (4, 4), color='green').save(image_buffer, format='PNG')
        image = SimpleUploadedFile(
            'plant.png',
            image_buffer.getvalue(),
            content_type='image/png',
        )

        response = self.client.post(
            '/api/plant-health/analyze/',
            {'image': image, 'crop': 'tomato', 'weather_codes': '61'},
            format='multipart',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['schedule']['reason'], 'symptom')
        self.assertEqual(response.data['schedule']['interval_days'], 3)
        schedule = PhotoSchedule.objects.get(user=self.user, crop='tomato')
        self.assertIsNotNone(schedule.last_photo_at)
        self.assertEqual(
            (schedule.next_due_at - schedule.last_photo_at).days,
            3,
        )
