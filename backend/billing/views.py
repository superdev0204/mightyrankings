import os
import stripe
from datetime import datetime, timezone as dt_timezone

from django.conf import settings
from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse, HttpResponse
from django.contrib.auth import get_user_model

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status

from businesses.models import Business

User = get_user_model()

STRIPE_SECRET_KEY = getattr(settings, "STRIPE_SECRET_KEY", os.environ.get("STRIPE_SECRET_KEY", ""))
STRIPE_WEBHOOK_SECRET = getattr(settings, "STRIPE_WEBHOOK_SECRET", os.environ.get("STRIPE_WEBHOOK_SECRET", ""))
PRICE_MONTHLY = getattr(settings, "STRIPE_PRICE_MONTHLY", os.environ.get("STRIPE_PRICE_MONTHLY", ""))
PRICE_YEARLY  = getattr(settings, "STRIPE_PRICE_YEARLY", os.environ.get("STRIPE_PRICE_YEARLY", ""))

stripe.api_key = STRIPE_SECRET_KEY


def _price_for_plan(plan: str) -> str:
    return PRICE_YEARLY if plan == "yearly" else PRICE_MONTHLY


def _user_from_subscription(sub):
    # Try metadata.user_id first
    meta_uid = (sub.get("metadata") or {}).get("user_id")
    if meta_uid:
        try:
            return User.objects.get(pk=int(meta_uid))
        except Exception:
            pass
    # Fallback by customer id
    cust = sub.get("customer")
    if cust:
        try:
            return User.objects.get(stripe_customer_id=cust)
        except Exception:
            pass
    return None


def _apply_subscription_to_user(user: User, sub):
    """Persist subscription → user fields, and reflect on businesses."""
    if not sub:
        return

    status_val = sub.get("status")
    price_id = None
    try:
        items = sub.get("items", {}).get("data", [])
        if items and items[0].get("price"):
            price_id = items[0]["price"]["id"]
    except Exception:
        pass

    cpe = sub.get("current_period_end")
    expires = None
    if cpe:
        expires = datetime.fromtimestamp(int(cpe), tz=dt_timezone.utc).date()

    user.stripe_subscription_id = sub.get("id") or user.stripe_subscription_id
    user.stripe_price_id = price_id or user.stripe_price_id
    user.premium_expires = expires
    user.premium_membership = status_val in ("active", "trialing")

    if not user.stripe_customer_id and sub.get("customer"):
        user.stripe_customer_id = sub["customer"]

    user.save(update_fields=[
        "premium_membership", "premium_expires",
        "stripe_subscription_id", "stripe_price_id", "stripe_customer_id"
    ])

    Business.objects.filter(claimed_by_id=user.id).update(is_premium=user.premium_membership)


def _handle_checkout_completed(session):
    # Called by webhook after checkout completion
    customer = session.get("customer")
    subscription = session.get("subscription")
    client_ref = session.get("client_reference_id")

    user = None
    if client_ref:
        try:
            user = User.objects.get(pk=int(client_ref))
        except Exception:
            user = None

    if not user:
        email = (session.get("customer_details") or {}).get("email") or session.get("customer_email")
        if email:
            try:
                user = User.objects.get(email=email)
            except Exception:
                user = None

    if not user:
        return

    if customer and (not user.stripe_customer_id):
        user.stripe_customer_id = customer

    if subscription:
        # retrieve full sub (if only id)
        if isinstance(subscription, str):
            sub = stripe.Subscription.retrieve(subscription)
        else:
            sub = subscription
        _apply_subscription_to_user(user, sub)
    else:
        user.save(update_fields=["stripe_customer_id"])


def _handle_subscription_updated(sub):
    user = _user_from_subscription(sub)
    if user:
        _apply_subscription_to_user(user, sub)


def _handle_subscription_deleted(sub):
    user = _user_from_subscription(sub)
    if not user:
        return
    user.premium_membership = False
    user.premium_expires = None
    user.stripe_subscription_id = None
    user.stripe_price_id = None
    user.save(update_fields=[
        "premium_membership", "premium_expires",
        "stripe_subscription_id", "stripe_price_id"
    ])
    Business.objects.filter(claimed_by_id=user.id).update(is_premium=False)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_checkout_session(request):
    """
    Body: { plan: 'monthly'|'yearly', success_url?: str, cancel_url?: str }
    Will automatically include {CHECKOUT_SESSION_ID} in success_url if missing.
    """
    user: User = request.user
    plan = (request.data.get("plan") or "monthly").strip().lower()
    price_id = request.data.get("price_id") or _price_for_plan(plan)
    if not price_id:
        return Response({"detail": "Price not configured."}, status=status.HTTP_400_BAD_REQUEST)

    # Frontend origin or current
    default_origin = getattr(settings, "FRONTEND_ORIGIN", "") or request.build_absolute_uri("/").rstrip("/")

    success_url = (request.data.get("success_url") or f"{default_origin}/Premium").strip()
    cancel_url  = (request.data.get("cancel_url")  or f"{default_origin}/Premium").strip()

    # Ensure we bubble session id back to the client
    if "{CHECKOUT_SESSION_ID}" not in success_url:
        sep = "&" if ("?" in success_url) else "?"
        success_url = f"{success_url}{sep}checkout=success&session_id={{CHECKOUT_SESSION_ID}}"

    try:
        customer = user.stripe_customer_id or None
        session = stripe.checkout.Session.create(
            mode="subscription",
            payment_method_types=["card"],
            customer=customer,
            customer_email=None if customer else user.email,
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=success_url,
            cancel_url=f"{cancel_url}?checkout=cancel",
            allow_promotion_codes=True,
            client_reference_id=str(user.id),
            metadata={"user_id": str(user.id), "plan": plan},
            subscription_data={
                "metadata": {"user_id": str(user.id), "plan": plan}
            },
        )
        return Response({"id": session.id, "url": session.url}, status=200)
    except Exception as e:
        return Response({"detail": str(e)}, status=400)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_portal_session(request):
    user: User = request.user
    return_url = request.data.get("return_url") or getattr(settings, "FRONTEND_ORIGIN", "") or request.build_absolute_uri("/")

    if not user.stripe_customer_id:
        return Response({"detail": "No Stripe customer found for this user."}, status=400)

    try:
        portal = stripe.billing_portal.Session.create(
            customer=user.stripe_customer_id,
            return_url=return_url,
        )
        return Response({"url": portal.url})
    except Exception as e:
        return Response({"detail": str(e)}, status=400)


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def stripe_webhook(request):
    payload = request.body
    sig = request.META.get("HTTP_STRIPE_SIGNATURE")

    try:
        event = stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
    except Exception:
        # Bad signature / missing secret
        return HttpResponse(status=400)

    etype = event.get("type")
    data = event.get("data", {}).get("object", {})

    if etype == "checkout.session.completed":
        _handle_checkout_completed(data)

    elif etype in ("customer.subscription.created", "customer.subscription.updated"):
        _handle_subscription_updated(data)

    elif etype in ("customer.subscription.deleted", "customer.subscription.canceled"):
        _handle_subscription_deleted(data)

    elif etype in ("invoice.paid", "invoice.payment_succeeded"):
        # defensive: pull sub and apply
        sub_id = data.get("subscription")
        if sub_id:
            sub = stripe.Subscription.retrieve(sub_id)
            _handle_subscription_updated(sub)

    return HttpResponse(status=200)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def sync_checkout_session(request):
    """
    Fallback when webhook is blocked: client posts {session_id}, we fetch from Stripe
    and update the user immediately.
    """
    session_id = (request.data.get("session_id") or "").strip()
    if not session_id:
        return Response({"detail": "session_id required"}, status=400)

    try:
        session = stripe.checkout.Session.retrieve(session_id, expand=["subscription", "customer"])
    except Exception as e:
        return Response({"detail": f"Unable to fetch session: {e}"}, status=400)

    # security: ensure the session belongs to this user
    client_ref = session.get("client_reference_id")
    if str(request.user.id) != str(client_ref):
        return Response({"detail": "Session does not belong to this user."}, status=403)

    # Store customer id if new
    cust = session.get("customer")
    if cust and (not request.user.stripe_customer_id):
        request.user.stripe_customer_id = cust
        request.user.save(update_fields=["stripe_customer_id"])

    # Apply subscription if present
    sub = session.get("subscription")
    if isinstance(sub, str):
        try:
            sub = stripe.Subscription.retrieve(sub)
        except Exception:
            sub = None

    if sub:
        _apply_subscription_to_user(request.user, sub)

    return Response({"ok": True, "premium_membership": request.user.premium_membership})
