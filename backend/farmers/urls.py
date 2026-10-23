from django.urls import path

from .views import (
    ChangePasswordView,
    CropLogView,
    CurrentUserView,
    FarmerProfileView,
    LoginView,
    LogoutView,
    RegisterView,
    csrf_token,
)

urlpatterns = [
    path("auth/csrf/", csrf_token, name="auth-csrf"),
    path("auth/register/", RegisterView.as_view(), name="auth-register"),
    path("auth/login/", LoginView.as_view(), name="auth-login"),
    path("auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path("auth/me/", CurrentUserView.as_view(), name="auth-current-user"),
    path("auth/profile/", FarmerProfileView.as_view(), name="auth-profile"),
    path("auth/password/", ChangePasswordView.as_view(), name="auth-password"),
    path("crop-log/", CropLogView.as_view(), name="crop-log"),
]