from rest_framework import serializers
from django.db.models import Count, Q
from businesses.models import Business, Doctor  # <-- import both models
from .models import Category


class CategorySerializer(serializers.ModelSerializer):
    parent = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(), allow_null=True, required=False
    )
    # Read-only full path like "Lawyers/Personal_Injury_Lawyers"
    full_slug = serializers.CharField(read_only=True)

    # Expose combined count as "business_count" (keeps frontend compatible)
    business_count = serializers.SerializerMethodField()

    # Breadcrumb for UI: [{id, name, slug, full_slug}, ...root→self]
    breadcrumb = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = [
            "id",
            "slug", "name", "description", "icon", "color", "business_count",
            "parent", "full_slug", "breadcrumb",
        ]
        extra_kwargs = {
            # Slug is generated server-side; keep read-only so URLs stay stable.
            "slug": {"read_only": True},
        }

    def get_business_count(self, obj: Category) -> int:
        """
        Return combined active counts for Business + Doctor.
        Prefer an annotated 'combined_count' if present (set by the view),
        else compute with two quick queries.
        """
        annotated = getattr(obj, "combined_count", None)
        if annotated is not None:
            try:
                return int(annotated)
            except Exception:
                pass

        # Fallback – compute per object (fine for small lists like /categories/top)
        biz_n = Business.objects.filter(category_id=obj.id, status="active").count()
        doc_n = Doctor.objects.filter(category_id=obj.id, status="active").count()
        return int(biz_n + doc_n)

    def get_breadcrumb(self, obj: Category):
        """
        Cycle-safe breadcrumb with guards.
        Also avoid heavy work for list endpoints where breadcrumb isn't needed.
        """
        # Skip for list responses to keep them fast/light
        try:
            view = self.context.get("view", None)
            if getattr(view, "action", None) == "list":
                return []
        except Exception:
            pass

        chain = []
        cur = obj
        seen = set()
        steps = 0
        MAX_DEPTH = 50  # sanity cap

        while cur and steps < MAX_DEPTH:
            # detect cycles (self-parent or A→…→A)
            if cur.id in seen:
                # append the current and stop; indicates truncated/cyclic chain
                chain.append({
                    "id": cur.id,
                    "name": cur.name,
                    "slug": cur.slug,
                    "full_slug": cur.full_slug,
                })
                break
            seen.add(cur.id)

            chain.append({
                "id": cur.id,
                "name": cur.name,
                "slug": cur.slug,
                "full_slug": cur.full_slug,
            })
            cur = getattr(cur, "parent", None)
            steps += 1

        chain.reverse()
        return chain
