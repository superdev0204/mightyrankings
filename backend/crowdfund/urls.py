from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CampaignViewSet, stripe_webhook

router = DefaultRouter()
router.register(r"campaigns", CampaignViewSet, basename="crowdfund-campaigns")

urlpatterns = [
    path("", include(router.urls)),
    path("stripe/webhook/", stripe_webhook, name="crowdfund-stripe-webhook"),
]
