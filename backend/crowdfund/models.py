from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils.timezone import now
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType

from businesses.models import Business, Doctor  # both live in "businesses" app


class CrowdfundCampaign(models.Model):
    # ---- Legacy (lawyer-only) link; kept for backward compatibility ----
    business = models.ForeignKey(
        Business,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="crowdfund_campaigns",
        help_text="Legacy link; generic target below is preferred.",
    )

    # ---- Generic target so we can attach to Business or Doctor ----
    content_type = models.ForeignKey(ContentType, null=True, blank=True, on_delete=models.CASCADE)
    object_id = models.PositiveIntegerField(null=True, blank=True)
    target = GenericForeignKey("content_type", "object_id")

    # ---- Campaign fields ----
    currency = models.CharField(max_length=10, default="usd")
    goal_cents = models.PositiveIntegerField(default=50000)  # $500 default goal
    amount_raised_cents = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, default="active")  # active|funded|paused
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(default=now)

    class Meta:
        constraints = [
            # unique per legacy business (when set)
            models.UniqueConstraint(
                fields=["business"],
                condition=Q(business__isnull=False),
                name="uniq_crowdfundcampaign_business_nonnull",
            ),
            # unique per generic target (when set)
            models.UniqueConstraint(
                fields=["content_type", "object_id"],
                condition=Q(content_type__isnull=False) & Q(object_id__isnull=False),
                name="uniq_crowdfundcampaign_target_nonnull",
            ),
        ]

    def __str__(self):
        who = self.resolved_target
        label = getattr(who, "name", None) or getattr(who, "provider_name", None) or "Listing"
        return f"Campaign({label})"

    def save(self, *args, **kwargs):
        self.updated_at = now()
        return super().save(*args, **kwargs)

    @property
    def resolved_target(self):
        """Prefer the generic target; fall back to legacy business."""
        return self.target or self.business

    @property
    def target_kind(self):
        t = self.resolved_target
        if isinstance(t, Business):
            return "business"
        if isinstance(t, Doctor):
            return "doctor"
        return None


class Contribution(models.Model):
    STATUS_CHOICES = (
        ("requires_payment", "Requires payment"),
        ("succeeded", "Succeeded"),
        ("failed", "Failed"),
        ("refunded", "Refunded"),
    )

    campaign = models.ForeignKey(
        CrowdfundCampaign,
        on_delete=models.CASCADE,
        related_name="contributions",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="contributions",
    )

    donor_name = models.CharField(max_length=255, null=True, blank=True)
    donor_email = models.EmailField(null=True, blank=True)

    amount_cents = models.PositiveIntegerField(default=0)
    currency = models.CharField(max_length=10, default="usd")

    status = models.CharField(max_length=32, choices=STATUS_CHOICES, default="requires_payment")

    # Stripe tracking
    stripe_checkout_session_id = models.CharField(max_length=200, blank=True, null=True, db_index=True)
    stripe_payment_intent_id = models.CharField(max_length=200, blank=True, null=True, db_index=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(default=now)

    class Meta:
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["stripe_checkout_session_id"]),
            models.Index(fields=["stripe_payment_intent_id"]),
            models.Index(fields=["created_at"]),
        ]
        ordering = ["-created_at"]

    def __str__(self):
        return f"Contribution({self.amount_cents} {self.currency} → campaign {self.campaign_id})"

    def save(self, *args, **kwargs):
        if not self.currency:
            self.currency = self.campaign.currency
        self.updated_at = now()
        return super().save(*args, **kwargs)
