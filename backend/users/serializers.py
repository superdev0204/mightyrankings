from rest_framework import serializers
from .models import User


def _is_admin(u) -> bool:
    return bool(
        getattr(u, "is_superuser", False)
        or getattr(u, "is_staff", False)
        or getattr(u, "user_type", "") == "admin"
    )


class UserSerializer(serializers.ModelSerializer):
    # Reverse FK from Business.claimed_by -> User.claimed_businesses
    claimed_businesses = serializers.PrimaryKeyRelatedField(many=True, read_only=True)

    class Meta:
        model = User
        fields = [
            "id", "username", "email", "full_name",
            "user_type", "status",
            "profile_image", "bio",
            "verified", "total_reviews",
            "premium_membership", "premium_expires",
            "stripe_customer_id", "stripe_subscription_id", "stripe_price_id",
            "date_joined",
            "claimed_businesses",
        ]
        read_only_fields = [
            "id", "username", "email",
            "verified", "total_reviews",
            "date_joined", "claimed_businesses",
            # Stripe IDs are managed by webhook
            "stripe_customer_id", "stripe_subscription_id", "stripe_price_id",
        ]
        extra_kwargs = {
            "full_name": {"required": False, "allow_blank": True},
            "bio": {"required": False, "allow_blank": True, "allow_null": True},
            "profile_image": {"required": False, "allow_null": True},
        }

    def __init__(self, *args, **kwargs):
        """
        Allow admins to write admin-only fields by toggling read_only at runtime.
        """
        super().__init__(*args, **kwargs)
        req = self.context.get("request")
        if req and req.user and _is_admin(req.user):
            for fname in ("user_type", "status", "premium_membership", "premium_expires"):
                if fname in self.fields:
                    self.fields[fname].read_only = False
