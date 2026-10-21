from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import CropLogEntry, FarmerProfile


class FarmerApiTests(TestCase):
    def setUp(self):
        self.client = APIClient(enforce_csrf_checks=True)
        self.client.get('/api/auth/csrf/')
        self.csrf_token = self.client.cookies['csrftoken'].value

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
