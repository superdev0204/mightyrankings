import stripe
from django.conf import settings
from django.utils.timezone import now
from django.contrib.contenttypes.models import ContentType
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import csrf_exempt

from businesses.models import Business, Doctor
from .models import CrowdfundCampaign, Contribution
from .serializers import CrowdfundCampaignSerializer

stripe.api_key = settings.STRIPE_SECRET_KEY

def _site_url(request):
    base = request.build_absolute_uri("/")
    return base[:-1] if base.endswith("/") else base

def _ensure_campaign_for_target(target_obj):
    """
    Create or fetch a campaign for either a Business or a Doctor.
    Back-compat: if target is Business and there's a legacy row (business FK), reuse it.
    """
    if isinstance(target_obj, Business):
        # 1) prefer legacy row if exists
        camp = CrowdfundCampaign.objects.filter(business=target_obj).first()
        if camp:
            return camp
        # 2) else use generic target
        ct = ContentType.objects.get_for_model(Business)
        camp, _ = CrowdfundCampaign.objects.get_or_create(
            content_type=ct, object_id=target_obj.id,
            defaults={"currency": "usd"}
        )
        # also back-fill legacy FK for Business to keep old code working
        if camp.business_id is None:
            camp.business = target_obj
            camp.save(update_fields=["business", "updated_at"])
        return camp

    if isinstance(target_obj, Doctor):
        ct = ContentType.objects.get_for_model(Doctor)
        camp, _ = CrowdfundCampaign.objects.get_or_create(
            content_type=ct, object_id=target_obj.id,
            defaults={"currency": "usd"}
        )
        return camp

    raise ValueError("Unsupported target type")

def _resolve_target_by_type_and_id(listing_type: str, listing_id: int):
    lt = (listing_type or "").strip().lower()
    if lt == "business":
        return get_object_or_404(Business, pk=listing_id)
    if lt == "doctor":
        return get_object_or_404(Doctor, pk=listing_id)
    raise ValueError("listing_type must be 'business' or 'doctor'")

class CampaignViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = CrowdfundCampaign.objects.all().select_related("business")
    serializer_class = CrowdfundCampaignSerializer
    permission_classes = [AllowAny]

    # ---------- Backward compatible (business) ----------
    # GET /api/crowdfund/campaigns/for-business/<business_id>/
    @action(detail=False, methods=["get"], url_path=r"for-business/(?P<business_id>\d+)")
    def for_business(self, request, business_id=None):
        biz = get_object_or_404(Business, pk=int(business_id))
        camp = _ensure_campaign_for_target(biz)
        return Response(self.get_serializer(camp).data, status=200)

    # Some frontend used underscore variant earlier:
    # GET /api/crowdfund/campaigns/for_business/<business_id>/
    @action(detail=False, methods=["get"], url_path=r"for_business/(?P<business_id>\d+)")
    def for_business_underscore(self, request, business_id=None):
        return self.for_business(request, business_id=business_id)

    # ---------- Doctor endpoint ----------
    # GET /api/crowdfund/campaigns/for-doctor/<doctor_id>/
    @action(detail=False, methods=["get"], url_path=r"for-doctor/(?P<doctor_id>\d+)")
    def for_doctor(self, request, doctor_id=None):
        doc = get_object_or_404(Doctor, pk=int(doctor_id))
        camp = _ensure_campaign_for_target(doc)
        return Response(self.get_serializer(camp).data, status=200)

    # ---------- Generic endpoint (recommended) ----------
    # GET /api/crowdfund/campaigns/for-listing/?type=business|doctor&id=123
    @action(detail=False, methods=["get"], url_path=r"for-listing")
    def for_listing(self, request):
        try:
            listing_type = request.query_params.get("type")
            listing_id = int(request.query_params.get("id"))
            target = _resolve_target_by_type_and_id(listing_type, listing_id)
        except Exception as e:
            return Response({"detail": f"Invalid request: {e}"}, status=400)

        camp = _ensure_campaign_for_target(target)
        return Response(self.get_serializer(camp).data, status=200)

    # ---------- Checkout (works for both) ----------
    # POST /api/crowdfund/campaigns/checkout/
    # body: { type: "business"|"doctor", id: <int>, amount_cents, donor_name?, donor_email?, return_url? }
    @action(detail=False, methods=["post"], url_path="checkout")
    def checkout(self, request):
        try:
            listing_type = (request.data.get("type") or "business").strip().lower()
            listing_id = int(request.data.get("id") or request.data.get("business_id"))
            amount_cents = int(request.data.get("amount_cents"))
            donor_name = (request.data.get("donor_name") or "").strip() or None
            donor_email = (request.data.get("donor_email") or "").strip() or None
            return_url = (request.data.get("return_url") or "").strip() or None
        except Exception:
            return Response({"detail": "Invalid payload."}, status=400)

        if amount_cents < 100:
            return Response({"detail": "Minimum contribution is $1.00."}, status=400)

        try:
            target = _resolve_target_by_type_and_id(listing_type, listing_id)
        except Exception as e:
            return Response({"detail": str(e)}, status=404)

        camp = _ensure_campaign_for_target(target)

        # unify name and id for display/redirect
        target_name = getattr(target, "name", None) or getattr(target, "provider_name", "Listing")
        target_id = getattr(target, "id", None)

        contrib = Contribution.objects.create(
            campaign=camp,
            user=request.user if (request.user and request.user.is_authenticated) else None,
            donor_name=donor_name,
            donor_email=donor_email,
            amount_cents=amount_cents,
            currency=camp.currency,
            status="requires_payment",
        )

        success_url = (return_url or _site_url(request)) + f"?support_success=1&listing={target_id}"
        cancel_url = (return_url or _site_url(request)) + f"?support_canceled=1&listing={target_id}"

        session = stripe.checkout.Session.create(
            mode="payment",
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": camp.currency,
                    "product_data": {"name": f"Support {target_name} (Crowdfund Premium)"},
                    "unit_amount": amount_cents,
                },
                "quantity": 1,
            }],
            customer_email=donor_email or None,
            metadata={
                "contribution_id": str(contrib.id),
                "campaign_id": str(camp.id),
                "target_kind": camp.target_kind or "business",
                "target_id": str(target_id or ""),
                "donor_name": donor_name or "",
                "donor_email": donor_email or "",
            },
            success_url=success_url,
            cancel_url=cancel_url,
        )

        contrib.stripe_checkout_session_id = session.id
        contrib.stripe_payment_intent_id = session.payment_intent
        contrib.updated_at = now()
        contrib.save(update_fields=["stripe_checkout_session_id", "stripe_payment_intent_id", "updated_at"])

        return Response({"url": session.url}, status=200)

@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def stripe_webhook(request):
    payload = request.body
    sig_header = request.META.get("HTTP_STRIPE_SIGNATURE")
    webhook_secret = settings.STRIPE_WEBHOOK_SECRET

    try:
        event = stripe.Webhook.construct_event(payload=payload, sig_header=sig_header, secret=webhook_secret)
    except Exception as e:
        return Response({"detail": f"Invalid payload: {e}"}, status=400)

    from django.db import transaction
    from .models import Contribution

    def _mark_contribution_succeeded(contrib: Contribution, amount_total: int | None, payment_intent_id: str | None):
        if contrib.status == "succeeded":
            return
        contrib.status = "succeeded"
        if amount_total:
            contrib.amount_cents = amount_total
        if payment_intent_id:
            contrib.stripe_payment_intent_id = payment_intent_id
        contrib.updated_at = now()
        contrib.save(update_fields=["status", "amount_cents", "stripe_payment_intent_id", "updated_at"])

        camp = contrib.campaign
        with transaction.atomic():
            camp.amount_raised_cents += contrib.amount_cents
            if camp.amount_raised_cents >= camp.goal_cents and camp.status != "funded":
                camp.status = "funded"

                # ⭐ Upgrade premium on the correct target
                target = camp.resolved_target
                try:
                    from datetime import date, timedelta
                    expires = date.today() + timedelta(days=365)
                    if hasattr(target, "is_premium"):
                        target.is_premium = True
                        if hasattr(target, "premium_expires"):
                            target.premium_expires = expires
                        target.save(update_fields=["is_premium"] + (["premium_expires"] if hasattr(target, "premium_expires") else []))
                except Exception:
                    pass

            camp.updated_at = now()
            camp.save(update_fields=["amount_raised_cents", "status", "updated_at"])

    etype = event.get("type", "")

    if etype == "checkout.session.completed":
        session = event["data"]["object"]
        metadata = session.get("metadata") or {}
        contrib_id = metadata.get("contribution_id")
        amount_total = session.get("amount_total")
        payment_intent_id = session.get("payment_intent")

        if contrib_id:
            try:
                contrib = Contribution.objects.select_related("campaign", "campaign__business").get(pk=int(contrib_id))
            except Contribution.DoesNotExist:
                return Response(status=200)
            _mark_contribution_succeeded(contrib, amount_total, payment_intent_id)
        elif payment_intent_id:
            try:
                contrib = Contribution.objects.select_related("campaign", "campaign__business").get(
                    stripe_payment_intent_id=payment_intent_id
                )
                _mark_contribution_succeeded(contrib, amount_total, payment_intent_id)
            except Contribution.DoesNotExist:
                pass

    elif etype == "payment_intent.succeeded":
        pi = event["data"]["object"]
        payment_intent_id = pi.get("id")
        amount_received = pi.get("amount_received")
        try:
            contrib = Contribution.objects.select_related("campaign", "campaign__business").get(
                stripe_payment_intent_id=payment_intent_id
            )
            _mark_contribution_succeeded(contrib, amount_received, payment_intent_id)
        except Contribution.DoesNotExist:
            pass

    return Response(status=200)
