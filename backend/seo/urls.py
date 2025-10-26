from django.urls import path, include
from rest_framework.routers import DefaultRouter
from seo.views import PageMetaViewSet

router = DefaultRouter()
router.register(r'page-meta', PageMetaViewSet, basename='page-meta')

urlpatterns = [
    path('', include(router.urls)),
]
