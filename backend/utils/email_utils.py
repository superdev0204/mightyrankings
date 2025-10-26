from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils.html import strip_tags
import logging

log = logging.getLogger(__name__)

def send_email(subject: str, to: list[str], template_base: str, context: dict) -> bool:
    """
    Renders templates:
      templates/emails/{template_base}.html
      templates/emails/{template_base}.txt  (optional; auto-generated if missing)
    and sends a multipart email (text+html).
    """
    try:
        html_body = render_to_string(f"emails/{template_base}.html", context)
        try:
            text_body = render_to_string(f"emails/{template_base}.txt", context)
        except Exception:
            text_body = strip_tags(html_body)

        msg = EmailMultiAlternatives(
            subject=subject,
            body=text_body,
            from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None),
            to=to,
        )
        msg.attach_alternative(html_body, "text/html")
        msg.send(fail_silently=False)
        return True
    except Exception as e:
        log.exception("Email send failed: %s", e)
        return False


# ---------- Specialized helpers you can call from viewsets ----------

def email_user_welcome(user):
    if not user or not getattr(user, "email", None):
        return False
    ctx = {"user": user}
    return send_email(
        subject="Welcome to MightyRankings!",
        to=[user.email],
        template_base="user_welcome",
        context=ctx,
    )

def email_user_approved(user):
    if not user or not getattr(user, "email", None):
        return False
    ctx = {"user": user}
    return send_email(
        subject="Your MightyRankings account is approved",
        to=[user.email],
        template_base="user_approved",
        context=ctx,
    )

def email_business_approved(biz, recipient_email: str | None):
    if not recipient_email:
        return False
    ctx = {"business": biz}
    return send_email(
        subject=f'Your business "{getattr(biz, "name", "Business")}" is approved',
        to=[recipient_email],
        template_base="business_approved",
        context=ctx,
    )

def email_review_approved(review, business, reviewer_email: str | None):
    if not reviewer_email:
        return False
    ctx = {"review": review, "business": business}
    return send_email(
        subject=f'Your review for "{getattr(business, "name", "Business")}" is live',
        to=[reviewer_email],
        template_base="review_approved_reviewer",
        context=ctx,
    )

def email_owner_new_review(business, owner_email: str | None, review=None):
    if not owner_email:
        return False
    ctx = {"business": business, "review": review}
    return send_email(
        subject=f'New review for {getattr(business, "name", "your business")}',
        to=[owner_email],
        template_base="review_approved_owner",
        context=ctx,
    )

def email_claim_approved(business, claimant_email: str | None) -> bool:
    if not claimant_email:
        return False
    ctx = {"business": business}
    return send_email(
        subject=f'Your claim for "{getattr(business, "name", "Business")}" was approved',
        to=[claimant_email],
        template_base="claim_approved",
        context=ctx,
    )

def email_claim_rejected(business, claimant_email: str | None, admin_note: str | None = None) -> bool:
    if not claimant_email:
        return False
    ctx = {"business": business, "admin_note": admin_note or ""}
    return send_email(
        subject=f'Your claim for "{getattr(business, "name", "Business")}" was not approved',
        to=[claimant_email],
        template_base="claim_rejected",
        context=ctx,
    )
