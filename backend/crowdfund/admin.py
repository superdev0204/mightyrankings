from django.contrib import admin
from .models import CrowdfundCampaign, Contribution


@admin.register(CrowdfundCampaign)
class CrowdfundCampaignAdmin(admin.ModelAdmin):
    list_display = ("id", "target_kind", "legacy_business", "goal_cents", "amount_raised_cents", "status", "updated_at")
    list_filter = ("status",)
    search_fields = ("business__name",)
    readonly_fields = ("updated_at", "created_at")

    def target_kind(self, obj):
        return obj.target_kind

    def legacy_business(self, obj):
        return obj.business


@admin.register(Contribution)
class ContributionAdmin(admin.ModelAdmin):
    list_display = ("id", "campaign", "amount_cents", "currency", "status", "created_at")
    list_filter = ("status", "currency")
    search_fields = ("donor_name", "donor_email", "stripe_checkout_session_id", "stripe_payment_intent_id")
    readonly_fields = ("updated_at", "created_at")
