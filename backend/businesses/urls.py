from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import BusinessViewSet, DoctorViewSet, unified_search

app_name = "businesses"

router = DefaultRouter()
router.register(r"businesses", BusinessViewSet, basename="business")
router.register(r"doctors", DoctorViewSet, basename="doctor")

urlpatterns = [
    path("", include(router.urls)),

    path("unified_search/", unified_search, name="unified-search"),
]