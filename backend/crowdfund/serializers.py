from rest_framework import serializers
from django.contrib.contenttypes.models import ContentType
from .models import CrowdfundCampaign

class CrowdfundCampaignSerializer(serializers.ModelSerializer):
    target_kind = serializers.SerializerMethodField()
    target_id = serializers.SerializerMethodField()
    business = serializers.PrimaryKeyRelatedField(read_only=True)  # legacy echo

    class Meta:
        model = CrowdfundCampaign
        fields = [
            "id",
            # legacy
            "business",
            # generic target (read-only summary)
            "target_kind", "target_id",
            # campaign fields
            "currency", "goal_cents", "amount_raised_cents", "status",
            "created_at", "updated_at",
        ]
        read_only_fields = fields

    def get_target_kind(self, obj: CrowdfundCampaign):
        return obj.target_kind

    def get_target_id(self, obj: CrowdfundCampaign):
        t = obj.resolved_target
        return getattr(t, "id", None)
