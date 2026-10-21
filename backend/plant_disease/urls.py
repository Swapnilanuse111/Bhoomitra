from django.urls import path

from .views import PlantHealthAnalyzeView

urlpatterns = [
    path(
        "plant-health/analyze/",
        PlantHealthAnalyzeView.as_view(),
        name="plant-health-analyze",
    ),
]
