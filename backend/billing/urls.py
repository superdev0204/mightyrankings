from django.urls import path
from .views import create_checkout_session, create_portal_session, stripe_webhook, sync_checkout_session

urlpatterns = [
    path('create-checkout-session/', create_checkout_session, name='create-checkout-session'),
    path('create-portal-session/', create_portal_session, name='create-portal-session'),
    path('sync-session/', sync_checkout_session, name='sync-checkout-session'),  # NEW
    path('webhook/', stripe_webhook, name='stripe-webhook'),
]