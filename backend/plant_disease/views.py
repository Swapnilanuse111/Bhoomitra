from PIL import Image, UnidentifiedImageError
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from farmers.photo_schedule import photo_schedule_payload, record_photo_analysis
from farmers.serializers import PhotoScheduleCropSerializer, parse_photo_schedule_weather
from .predict import predict_disease

MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB

DISCLAIMER = (
    "हा फक्त फोटोवरून केलेला संभाव्य अंदाज आहे, तज्ज्ञांचं निदान नाही. "
    "फवारणीपूर्वी जवळच्या कृषी अधिकाऱ्याचा किंवा KVK चा सल्ला घ्या."
)


class PlantHealthAnalyzeView(APIView):
    parser_classes = [MultiPartParser, FormParser]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        crop_serializer = PhotoScheduleCropSerializer(
            data={'crop': request.data.get('crop', 'pomegranate')}
        )
        if not crop_serializer.is_valid():
            return Response(crop_serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        weather = parse_photo_schedule_weather(request.data)
        uploaded_file = request.FILES.get("image")

        if uploaded_file is None:
            return Response(
                {"error": "कृपया 'image' नावाच्या field मध्ये फोटो द्या."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if uploaded_file.size > MAX_IMAGE_BYTES:
            return Response(
                {"error": "फोटोचा आकार 5 MB पेक्षा कमी असावा."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Extension किंवा browser च्या MIME type वर विश्वास ठेवू नका; फाइल खरंच फोटो आहे का तपासा.
        try:
            with Image.open(uploaded_file) as img:
                img.verify()
            uploaded_file.seek(0)
        except (UnidentifiedImageError, OSError):
            return Response(
                {"error": "ही फाइल वैध फोटो नाही."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            result = predict_disease(uploaded_file)
        except FileNotFoundError as error:
            return Response(
                {"error": str(error)}, status=status.HTTP_503_SERVICE_UNAVAILABLE
            )

        result["disclaimer"] = DISCLAIMER
        schedule = record_photo_analysis(
            user=request.user,
            crop=crop_serializer.validated_data['crop'].lower(),
            analysis=result,
            weather=weather,
        )
        result['schedule'] = photo_schedule_payload(schedule)
        return Response(result, status=status.HTTP_200_OK)
