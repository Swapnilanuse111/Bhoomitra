from django.http import JsonResponse


def api_root(request):
    return JsonResponse({'name': 'Bhoomitra API', 'status': 'ok'})
