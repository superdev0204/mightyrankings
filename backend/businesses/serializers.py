from rest_framework import serializers
from django.utils.text import slugify
from django.utils.timezone import now

from .models import Business, Doctor
from categories.models import Category  # noqa
from django.contrib.auth import get_user_model

User = get_user_model()


# -------- slug helpers (lawyer/business) --------
def _unique_slug_for(instance, base_name: str) -> str:
    base = slugify(base_name) or "business"
    candidate = base
    n = 1
    Model = instance.__class__
    while Model.objects.filter(slug=candidate).exclude(pk=instance.pk).exists():
        candidate = f"{base}-{n}"
        n += 1
    return candidate


def _looks_auto_slug(slug: str | None, from_name: str | None) -> bool:
    if not slug or not from_name:
        return False
    auto = slugify(from_name) or "business"
    return slug == auto or slug.startswith(f"{auto}-")


class BusinessSerializer(serializers.ModelSerializer):
    """
    Lawyer-centric listing (Business).
    """
    # Foreign key by id (write) + convenient read-only info
    category_id = serializers.IntegerField(required=True)
    category_name = serializers.CharField(source="category.name", read_only=True)
    category_full_slug = serializers.CharField(source="category.full_slug", read_only=True)

    # CHANGED: works_for is now a simple URL (not a relation)
    works_for = serializers.URLField(required=False, allow_null=True, allow_blank=True)

    # owner id fields (raw IDs)
    claimed_by_id = serializers.IntegerField(allow_null=True, required=False)
    pending_claim_by_id = serializers.IntegerField(allow_null=True, required=False)

    # dates for UI
    created_date = serializers.DateTimeField(source="created_at", read_only=True)
    updated_date = serializers.DateTimeField(source="updated_at", read_only=True)

    # Convenience booleans for UI
    is_claimed = serializers.SerializerMethodField()
    has_pending_claim = serializers.SerializerMethodField()

    # URL-ish path for front-end routing (category_full_slug/slug)
    url_path = serializers.SerializerMethodField()

    class Meta:
        model = Business
        fields = [
            "id",
            "name",
            "license",
            "email",  # NEW
            # address
            "street_address", "city", "state", "zip",
            # profile
            "description", "practice_areas", "honors", "work_experience",
            "associations", "education", "speaking_engagements", "publications",
            "language",
            # contact/media
            "website", "phone", "image_url",
            # works-with/for (simple URL)
            "works_for",
            # claims
            "claimed_by_id", "claimed_at",
            "pending_claim_by_id", "pending_claim_notes", "pending_claim_requested_at",
            # monetization/ratings/status
            "is_premium", "premium_expires",
            "average_rating", "total_reviews",
            "status",
            # slugs/timestamps
            "slug", "created_at", "updated_at",
            "created_date", "updated_date",
            # category linkage
            "category_id", "category_name", "category_full_slug",
            # conveniences
            "is_claimed", "has_pending_claim", "url_path",
        ]
        read_only_fields = [
            "average_rating", "total_reviews",
            "slug", "created_at", "updated_at",
            "claimed_at", "pending_claim_requested_at",
            "is_claimed", "has_pending_claim",
            "category_name", "category_full_slug", "url_path",
            "created_date", "updated_date",
        ]

    # --- convenience getters ---
    def get_is_claimed(self, obj: Business) -> bool:
        return bool(getattr(obj, "claimed_by_id", None))

    def get_has_pending_claim(self, obj: Business) -> bool:
        return bool(getattr(obj, "pending_claim_by_id", None))

    def get_url_path(self, obj: Business) -> str:
        try:
            if obj.category and getattr(obj.category, "full_slug", None) and obj.slug:
                return f"{obj.category.full_slug}/{obj.slug}"
        except Exception:
            pass
        return obj.slug or ""

    # --- create/update to maintain updated_at and auto-slug behavior ---
    def create(self, validated_data):
        inst = super().create(validated_data)
        inst.updated_at = now()
        inst.save(update_fields=["updated_at"])
        return inst

    def update(self, instance, validated_data):
        old_name = instance.name
        new_name = validated_data.get("name", old_name)

        # If name changed and current slug looks auto-generated from the old name, regenerate.
        if new_name and new_name != old_name and _looks_auto_slug(instance.slug, old_name):
            validated_data["slug"] = _unique_slug_for(instance, new_name)

        instance = super().update(instance, validated_data)
        instance.updated_at = now()
        instance.save(update_fields=["updated_at"])
        return instance


class DoctorSerializer(serializers.ModelSerializer):
    """
    Doctor vertical listing.
    """
    category_id = serializers.IntegerField(required=False, allow_null=True)
    category_name = serializers.CharField(source="category.name", read_only=True)
    category_full_slug = serializers.CharField(source="category.full_slug", read_only=True)

    # CHANGED: works_for is now a simple URL (not a relation)
    works_for = serializers.URLField(required=False, allow_null=True, allow_blank=True)

    claimed_by_id = serializers.IntegerField(allow_null=True, required=False)
    pending_claim_by_id = serializers.IntegerField(allow_null=True, required=False)

    created_date = serializers.DateTimeField(source="created_at", read_only=True)
    updated_date = serializers.DateTimeField(source="updated_at", read_only=True)

    is_claimed = serializers.SerializerMethodField()
    has_pending_claim = serializers.SerializerMethodField()
    url_path = serializers.SerializerMethodField()

    class Meta:
        model = Doctor
        fields = [
            "id",
            # identity
            "provider_name", "specialty",
            "email",  # NEW
            # profile (medical)
            "description", "insurances", "popular_visit_reasons",
            # address
            "street_address", "city", "state", "zip",
            # practice & education
            "practice_names", "educations",
            # misc
            "languages", "gender", "npi_number",
            # contact/media
            "website", "phone", "image_url",
            # works-with/for (simple URL)
            "works_for",
            # ownership/claims
            "claimed_by_id", "claimed_at",
            "pending_claim_by_id", "pending_claim_notes", "pending_claim_requested_at",
            # monetization/ratings/status
            "is_premium", "premium_expires",
            "average_rating", "total_reviews", "status",
            # slug/timestamps
            "slug", "created_at", "updated_at",
            "created_date", "updated_date",
            # category linkage
            "category_id", "category_name", "category_full_slug",
            # conveniences
            "is_claimed", "has_pending_claim", "url_path",
        ]
        read_only_fields = [
            "average_rating", "total_reviews",
            "slug", "created_at", "updated_at",
            "claimed_at", "pending_claim_requested_at",
            "is_claimed", "has_pending_claim",
            "category_name", "category_full_slug", "url_path",
            "created_date", "updated_date",
        ]

    def get_is_claimed(self, obj: Doctor) -> bool:
        return bool(getattr(obj, "claimed_by_id", None))

    def get_has_pending_claim(self, obj: Doctor) -> bool:
        return bool(getattr(obj, "pending_claim_by_id", None))

    def get_url_path(self, obj: Doctor) -> str:
        try:
            if obj.category and getattr(obj.category, "full_slug", None) and obj.slug:
                return f"{obj.category.full_slug}/{obj.slug}"
        except Exception:
            pass
        return obj.slug or ""

    def create(self, validated_data):
        inst = super().create(validated_data)
        inst.updated_at = now()
        inst.save(update_fields=["updated_at"])
        return inst

    def update(self, instance, validated_data):
        old_name = instance.provider_name
        new_name = validated_data.get("provider_name", old_name)

        if new_name and new_name != old_name:
            old_auto = slugify(old_name) if old_name else ""
            if instance.slug in (old_auto, f"{old_auto}-") or (instance.slug or "").startswith(f"{old_auto}-"):
                base = slugify(new_name) or "doctor"
                candidate = base
                n = 1
                Model = instance.__class__
                while Model.objects.filter(slug=candidate).exclude(pk=instance.pk).exists():
                    candidate = f"{base}-{n}"
                    n += 1
                validated_data["slug"] = candidate

        instance = super().update(instance, validated_data)
        instance.updated_at = now()
        instance.save(update_fields=["updated_at"])
        return instance


class UnifiedSearchItemSerializer(serializers.Serializer):
    """
    Normalized, read-only projection for blended search results.
    """
    type = serializers.ChoiceField(choices=("lawyer", "doctor"))
    id = serializers.IntegerField()
    name = serializers.CharField()
    slug = serializers.CharField()
    category_full_slug = serializers.CharField(allow_null=True, required=False)
    city = serializers.CharField(allow_null=True, required=False)
    state = serializers.CharField(allow_null=True, required=False)
    average_rating = serializers.FloatField()
    total_reviews = serializers.IntegerField()
    is_premium = serializers.BooleanField()
    image_url = serializers.CharField(allow_null=True, required=False)
