import base64
from io import BytesIO

from PIL import Image
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import CropLogEntry, FarmerProfile


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
