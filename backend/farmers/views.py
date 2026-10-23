import base64
import binascii
from io import BytesIO

from PIL import Image, UnidentifiedImageError
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth import get_user_model
from django.contrib.auth import update_session_auth_hash
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from django.views.decorators.http import require_GET
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import CropLogEntry, FarmerProfile
from .serializers import CropLogEntrySerializer, FarmerProfileSerializer

MAX_AVATAR_BYTES = 2 * 1024 * 1024
AVATAR_MIME_FORMATS = {
    'image/jpeg': 'JPEG',
    'image/png': 'PNG',
    'image/webp': 'WEBP',
}

@require_GET
@ensure_csrf_cookie
def csrf_token(request):
    return JsonResponse({'csrfToken': get_token(request)})


def user_data(user):
    profile, _ = FarmerProfile.objects.get_or_create(
        user=user,
        defaults={'name': user.email.split('@', 1)[0]},
    )
    return {
        'id': user.pk,
        'email': user.email,
        'name': profile.name,
        'avatarData': profile.avatar_data,
    }


def validate_avatar_data(avatar_data):
    if not avatar_data:
        return
    try:
        header, encoded_image = avatar_data.split(',', 1)
        mime_type = header.removeprefix('data:').removesuffix(';base64')
        if header != f'data:{mime_type};base64' or mime_type not in AVATAR_MIME_FORMATS:
            raise ValueError
        image_bytes = base64.b64decode(encoded_image, validate=True)
    except (ValueError, binascii.Error) as error:
        raise ValidationError('Upload a valid JPEG, PNG, or WebP image.') from error

    if len(image_bytes) > MAX_AVATAR_BYTES:
        raise ValidationError('The profile photo must be 2 MB or smaller.')

    try:
        with Image.open(BytesIO(image_bytes)) as image:
            if image.format != AVATAR_MIME_FORMATS[mime_type]:
                raise ValidationError('The profile photo content does not match its format.')
            if image.width > 4096 or image.height > 4096:
                raise ValidationError('The profile photo dimensions must be 4096 pixels or smaller.')
            image.verify()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
        raise ValidationError('Upload a valid image file.') from error


@method_decorator(csrf_protect, name='dispatch')
class FarmerProfileView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        return Response(user_data(request.user))

    def put(self, request):
        serializer = FarmerProfileSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        email = data['email'].strip().lower()
        if get_user_model().objects.filter(email__iexact=email).exclude(pk=request.user.pk).exists():
            return Response(
                {'email': ['An account with this email already exists.']},
                status=status.HTTP_400_BAD_REQUEST,
            )

        profile, _ = FarmerProfile.objects.get_or_create(
            user=request.user,
            defaults={'name': request.user.email.split('@', 1)[0]},
        )
        try:
            validate_avatar_data(data.get('avatar_data', profile.avatar_data))
        except ValidationError as error:
            return Response(
                {'avatarData': error.messages},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with transaction.atomic():
                user = request.user
                user.email = email
                user.username = email
                user.save(update_fields=('email', 'username'))
                profile.name = data['name'].strip()
                if 'avatar_data' in data:
                    profile.avatar_data = data['avatar_data']
                profile.save(update_fields=('name', 'avatar_data'))
        except IntegrityError:
            return Response(
                {'email': ['An account with this email already exists.']},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(user_data(user))


@method_decorator(csrf_protect, name='dispatch')
class ChangePasswordView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        current_password = request.data.get('currentPassword')
        new_password = request.data.get('newPassword')
        confirm_password = request.data.get('confirmPassword')

        if not all(isinstance(value, str) and value for value in (
            current_password,
            new_password,
            confirm_password,
        )):
            return Response(
                {'error': 'Enter your current password and both new password fields.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not request.user.check_password(current_password):
            return Response(
                {'currentPassword': ['The current password is incorrect.']},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if new_password != confirm_password:
            return Response(
                {'confirmPassword': ['The new passwords do not match.']},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            validate_password(new_password, user=request.user)
        except ValidationError as error:
            return Response(
                {'newPassword': error.messages},
                status=status.HTTP_400_BAD_REQUEST,
            )

        request.user.set_password(new_password)
        request.user.save(update_fields=('password',))
        update_session_auth_hash(request, request.user)
        return Response({'message': 'Password updated successfully.'})


@method_decorator(csrf_protect, name='dispatch')
class RegisterView(APIView):
    permission_classes = (AllowAny,)

    def post(self, request):
        if not isinstance(request.data, dict):
            return Response(
                {'error': 'Submit account details as a JSON object.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        raw_name = request.data.get('name', '')
        raw_email = request.data.get('email', '')
        name = raw_name.strip() if isinstance(raw_name, str) else ''
        email = raw_email.strip().lower() if isinstance(raw_email, str) else ''
        password = request.data.get('password', '')

        if not name or len(name) > 80:
            return Response(
                {'error': 'Enter a name between 1 and 80 characters.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            validate_email(email)
        except ValidationError:
            return Response(
                {'error': 'Enter a valid email address.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(email) > 254:
            return Response(
                {'error': 'Enter a valid email address.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not isinstance(password, str):
            return Response(
                {'error': 'Enter a valid password.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            validate_password(password)
        except ValidationError as error:
            return Response(
                {'error': ' '.join(error.messages)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        User = get_user_model()
        if User.objects.filter(email__iexact=email).exists():
            return Response(
                {'error': 'An account with this email already exists.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with transaction.atomic():
                user = User.objects.create_user(
                    username=email,
                    email=email,
                    password=password,
                )
                FarmerProfile.objects.create(user=user, name=name)
        except IntegrityError:
            return Response(
                {'error': 'An account with this email already exists.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        login(request, user)
        request.session.set_expiry(1_209_600)
        return Response(user_data(user), status=status.HTTP_201_CREATED)


@method_decorator(csrf_protect, name='dispatch')
class LoginView(APIView):
    permission_classes = (AllowAny,)

    def post(self, request):
        if not isinstance(request.data, dict):
            return Response(
                {'error': 'Submit login details as a JSON object.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        raw_email = request.data.get('email', '')
        email = raw_email.strip().lower() if isinstance(raw_email, str) else ''
        password = request.data.get('password', '')
        if not email or not isinstance(password, str):
            return Response(
                {'error': 'Enter your email and password.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = authenticate(request, username=email, password=password)
        if user is None:
            return Response(
                {'error': 'Email or password is incorrect.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        login(request, user)
        request.session.set_expiry(
            1_209_600 if request.data.get('rememberMe') else 0
        )
        return Response(user_data(user))


@method_decorator(csrf_protect, name='dispatch')
class LogoutView(APIView):
    permission_classes = (AllowAny,)

    def post(self, request):
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class CurrentUserView(APIView):
    permission_classes = (AllowAny,)

    def get(self, request):
        if not request.user.is_authenticated:
            return Response({'user': None})
        return Response({'user': user_data(request.user)})


class CropLogView(generics.ListCreateAPIView):
    serializer_class = CropLogEntrySerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        return CropLogEntry.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
