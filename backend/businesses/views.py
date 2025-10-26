from django.utils import timezone
from django.utils.text import slugify
import django_filters
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated, IsAdminUser
from rest_framework.response import Response
from django.contrib.auth import get_user_model

from django.db import connection, transaction
from django.db.models import F, Q, Value, IntegerField, Case, When
from django.db.utils import DatabaseError

from categories.models import Category  # hierarchical Category with full_slug
from .models import Business, Doctor
from .serializers import BusinessSerializer, DoctorSerializer
from utils.email_utils import email_business_approved, email_claim_approved, email_claim_rejected
from .utils import recalc_category_counts  # (counts Business under Category)

import uuid
import time
import logging
import traceback

log = logging.getLogger("bulk_import")

User = get_user_model()

# ---- SEO helper (safe import; becomes None if seo app not present)
try:
    from seo.utils import ensure_business_meta  # ensure_business_meta(biz, refresh=True)
except Exception:  # pragma: no cover
    ensure_business_meta = None


class NumberInFilter(django_filters.BaseInFilter, django_filters.NumberFilter):
    pass


# -------------------- FILTERS --------------------
class BusinessFilter(django_filters.FilterSet):
    id__in = NumberInFilter(field_name="id", lookup_expr="in")

    # Category filters
    category = django_filters.CharFilter(field_name="category__name", lookup_expr="exact")
    category_id = django_filters.NumberFilter(field_name="category_id", lookup_expr="exact")
    category_full_slug = django_filters.CharFilter(field_name="category__full_slug", lookup_expr="exact")
    category_path = django_filters.CharFilter(field_name="category__full_slug", lookup_expr="startswith")

    # Ownership/claims
    claimed_by = django_filters.NumberFilter(field_name="claimed_by_id", lookup_expr="exact")
    pending_claim_by = django_filters.NumberFilter(field_name="pending_claim_by_id", lookup_expr="exact")

    # Address/profile filters (examples)
    city = django_filters.CharFilter(field_name="city", lookup_expr="iexact")
    state = django_filters.CharFilter(field_name="state", lookup_expr="iexact")
    language = django_filters.CharFilter(field_name="language", lookup_expr="iexact")
    practice_areas = django_filters.CharFilter(field_name="practice_areas", lookup_expr="icontains")

    # Back-compat: legacy ?tag=... maps to various profile text fields
    tag = django_filters.CharFilter(method="filter_legacy_tag")

    # Field-scoped OR search
    q = django_filters.CharFilter(method="filter_q")              # the query string
    search_in = django_filters.CharFilter(method="pass_through")  # comma list of fields

    def pass_through(self, queryset, name, value):
        return queryset

    def filter_legacy_tag(self, queryset, name, value: str):
        v = (value or "").strip()
        if not v:
            return queryset
        return queryset.filter(
            Q(practice_areas__icontains=v) |
            Q(honors__icontains=v) |
            Q(associations__icontains=v) |
            Q(education__icontains=v) |
            Q(publications__icontains=v) |
            Q(speaking_engagements__icontains=v) |
            Q(description__icontains=v)
        )

    def filter_q(self, queryset, name, value: str):
        value = (value or "").strip()
        if not value:
            return queryset

        raw = (self.data.get("search_in") or "")
        requested = [f.strip() for f in raw.split(",") if f.strip()]
        allowed = {
            "name", "description", "practice_areas",
            "honors", "work_experience", "associations",
            "education", "speaking_engagements", "publications",
            "language", "street_address", "city", "state", "zip",
            "website", "phone",
        }
        fields = [f for f in requested if f in allowed] or [
            "name", "description", "practice_areas", "city", "state", "zip", "language"
        ]

        q_obj = Q()
        for f in fields:
            q_obj |= Q(**{f + "__icontains": value})
        return queryset.filter(q_obj)

    class Meta:
        model = Business
        fields = [
            "status", "is_premium", "slug",
            "category", "category_id", "category_full_slug", "category_path",
            "claimed_by", "pending_claim_by",
            "city", "state", "language", "practice_areas",
            "q", "search_in", "tag",
        ]


class DoctorFilter(django_filters.FilterSet):
    id__in = NumberInFilter(field_name="id", lookup_expr="in")

    # Category filters
    category = django_filters.CharFilter(field_name="category__name", lookup_expr="exact")
    category_id = django_filters.NumberFilter(field_name="category_id", lookup_expr="exact")
    category_full_slug = django_filters.CharFilter(field_name="category__full_slug", lookup_expr="exact")
    category_path = django_filters.CharFilter(field_name="category__full_slug", lookup_expr="startswith")

    # Ownership/claims
    claimed_by = django_filters.NumberFilter(field_name="claimed_by_id", lookup_expr="exact")
    pending_claim_by = django_filters.NumberFilter(field_name="pending_claim_by_id", lookup_expr="exact")

    # Address/profile filters
    city = django_filters.CharFilter(field_name="city", lookup_expr="iexact")
    state = django_filters.CharFilter(field_name="state", lookup_expr="iexact")
    specialty = django_filters.CharFilter(field_name="specialty", lookup_expr="icontains")
    npi_number = django_filters.CharFilter(field_name="npi_number", lookup_expr="icontains")

    class Meta:
        model = Doctor
        fields = [
            "status", "is_premium", "slug",
            "category", "category_id", "category_full_slug", "category_path",
            "claimed_by", "pending_claim_by",
            "city", "state", "specialty", "npi_number",
        ]


# -------------------- Claim mixin (shared) --------------------
class _ClaimMixin:
    OWNER_EDITABLE_FIELDS = set()  # override in subclasses

    def _truthy(self, value):
        if value is None:
            return False
        return str(value).strip().lower() in ("1", "true", "yes", "on")

    def _owner_patch_payload(self, request):
        data = request.data or {}
        out = {}
        for k in self.OWNER_EDITABLE_FIELDS:
            if k in data and data.get(k) is not None:
                v = data.get(k)
                if k == "website" and isinstance(v, str) and v and not v.lower().startswith(("http://", "https://")):
                    v = f"https://{v}"
                if k == "works_for" and isinstance(v, str) and v and not v.lower().startswith(("http://", "https://")):
                    v = f"https://{v}"
                out[k] = v
        return out

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated])
    def claim(self, request, pk=None):
        obj = self.get_object()

        if obj.claimed_by_id and obj.claimed_by_id != request.user.id:
            return Response({"detail": "This listing is already owned."}, status=status.HTTP_409_CONFLICT)
        if obj.pending_claim_by_id and obj.pending_claim_by_id != request.user.id:
            return Response({"detail": "Another claim is already pending review."}, status=status.HTTP_409_CONFLICT)

        # Allow owners to edit selected fields while claiming
        patch_data = self._owner_patch_payload(request)
        for k, v in patch_data.items():
            setattr(obj, k, v)

        # moderation notes
        relationship = (request.data.get("relationship") or "").strip()
        verification_notes = (request.data.get("verification_notes") or request.data.get("notes") or "").strip()
        parts = []
        if relationship:
            parts.append(f"Relationship: {relationship}")
        if verification_notes:
            parts.append(verification_notes)
        notes = " | ".join(parts).strip()
        if notes:
            obj.pending_claim_notes = (f"{obj.pending_claim_notes}\n{notes}".strip()
                                       if obj.pending_claim_notes else notes)

        obj.pending_claim_by = request.user
        obj.pending_claim_requested_at = timezone.now()
        obj.updated_at = timezone.now()
        obj.save()

        return Response(self.get_serializer(obj).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], permission_classes=[IsAdminUser])
    def approve_claim(self, request, pk=None):
        obj = self.get_object()
        if not obj.pending_claim_by_id:
            return Response({"detail": "No pending claim to approve."}, status=400)

        claimant = obj.pending_claim_by
        obj.claimed_by = claimant
        obj.claimed_at = timezone.now()
        obj.pending_claim_by = None
        obj.pending_claim_notes = None
        obj.pending_claim_requested_at = None
        obj.updated_at = timezone.now()
        obj.save()

        try:
            if hasattr(claimant, "user_type") and claimant.user_type != "owner":
                claimant.user_type = "owner"
                claimant.save(update_fields=["user_type"])
        except Exception:
            pass

        try:
            if getattr(claimant, "email", None):
                email_claim_approved(obj, claimant.email)
        except Exception:
            pass

        return Response(self.get_serializer(obj).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], permission_classes=[IsAdminUser])
    def reject_claim(self, request, pk=None):
        obj = self.get_object()
        if not obj.pending_claim_by_id:
            return Response({"detail": "No pending claim to reject."}, status=400)

        claimant = obj.pending_claim_by
        admin_note = request.data.get("note") or ""
        if admin_note:
            obj.pending_claim_notes = admin_note

        obj.pending_claim_by = None
        obj.pending_claim_requested_at = None
        obj.updated_at = timezone.now()
        obj.save()

        try:
            if getattr(claimant, "email", None):
                email_claim_rejected(obj, claimant.email, admin_note=admin_note)
        except Exception:
            pass

        return Response(self.get_serializer(obj).data, status=status.HTTP_200_OK)


# -------------------- Business (Lawyers) --------------------
class BusinessViewSet(_ClaimMixin, viewsets.ModelViewSet):
    queryset = (
        Business.objects.only(
            # identity + slugs + status
            "id", "name", "license", "slug", "status",
            # NEW fields
            "email",
            "works_for",   # CHANGED: simple URL
            # address
            "street_address", "city", "state", "zip",
            # profile text
            "description", "practice_areas", "honors", "work_experience",
            "associations", "education", "speaking_engagements", "publications",
            "language",
            # contact
            "website", "phone", "image_url",
            # relations
            "category_id", "claimed_by_id", "pending_claim_by_id",
            # claim meta
            "claimed_at", "pending_claim_notes", "pending_claim_requested_at",
            # monetization/ratings
            "is_premium", "premium_expires", "average_rating", "total_reviews",
            # timestamps
            "created_at", "updated_at",
        )
        .select_related("category")
        .order_by("-updated_at")
    )
    serializer_class = BusinessSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter, filters.SearchFilter]
    filterset_class = BusinessFilter
    ordering_fields = ["updated_at", "created_at", "average_rating", "total_reviews", "is_premium"]

    # Legacy DRF ?search= support (broad)
    search_fields = [
        "name", "description", "practice_areas", "honors", "work_experience",
        "associations", "education", "speaking_engagements", "publications",
        "language", "street_address", "city", "state", "zip",
        "website", "phone", "email",  # NEW
        "category__name", "category__full_slug",
    ]

    # Fields owner may edit while claiming
    OWNER_EDITABLE_FIELDS = {
        "phone", "website", "image_url",
        "license", "description",
        "street_address", "city", "state", "zip",
        "practice_areas", "honors", "work_experience", "associations",
        "education", "speaking_engagements", "publications", "language",
        "email",        # NEW
        "works_for",    # CHANGED: simple URL
    }

    def get_permissions(self):
        if self.action == "bulk_create":  # TEMP: keep as in original
            return [AllowAny()]
        if self.action in ["create"]:
            return [IsAuthenticated()]
        if self.action in [
            "update", "partial_update", "destroy",
            "approve_claim", "reject_claim", "set_owner",
            "bulk_set_category",
        ]:
            return [IsAdminUser()]
        if self.action in ["claim"]:
            return [IsAuthenticated()]
        return [AllowAny()]

    def get_queryset(self):
        """
        Add prioritized ranking when ?q= is present.
        Rank breakdown (accumulating):
          +100 name==q (case-insensitive exact)
           +60 name startswith q
           +40 name contains q
           +20 practice_areas contains q
           +10 description contains q
            +5 category name contains q
            +5 city/state/zip contains q (each)
        Then order by -rank, -is_premium, -average_rating, -updated_at.
        """
        qs = super().get_queryset()

        default_order = ["-is_premium", "-average_rating", "-updated_at"]
        params = getattr(self.request, "query_params", {})
        raw_q = (params.get("q") or "").strip()

        if raw_q:
            q = raw_q
            qs = qs.filter(
                Q(name__icontains=q) |
                Q(description__icontains=q) |
                Q(practice_areas__icontains=q) |
                Q(city__icontains=q) |
                Q(state__icontains=q) |
                Q(zip__icontains=q) |
                Q(category__name__icontains=q) |
                Q(category__full_slug__icontains=q)
            )

            rank = (
                Case(When(name__iexact=q, then=Value(100)), default=Value(0), output_field=IntegerField()) +
                Case(When(name__istartswith=q, then=Value(60)), default=Value(0), output_field=IntegerField()) +
                Case(When(name__icontains=q, then=Value(40)), default=Value(0), output_field=IntegerField()) +
                Case(When(practice_areas__icontains=q, then=Value(20)), default=Value(0), output_field=IntegerField()) +
                Case(When(description__icontains=q, then=Value(10)), default=Value(0), output_field=IntegerField()) +
                Case(When(category__name__icontains=q, then=Value(5)), default=Value(0), output_field=IntegerField()) +
                Case(When(city__icontains=q, then=Value(5)), default=Value(0), output_field=IntegerField()) +
                Case(When(state__icontains=q, then=Value(5)), default=Value(0), output_field=IntegerField()) +
                Case(When(zip__icontains=q, then=Value(5)), default=Value(0), output_field=IntegerField())
            )
            qs = qs.annotate(rank=rank).order_by("-rank", *default_order)
        else:
            qs = qs.order_by(*default_order)

        return qs

    # ---------- Featured ----------
    @action(detail=False, methods=["get"])
    def featured(self, request):
        qs = (
            self.filter_queryset(self.get_queryset())
            .filter(status="active")
            .order_by("-average_rating")[:8]
        )
        return Response(self.get_serializer(qs, many=True).data)

    # ---------- Create / Update ----------
    def perform_create(self, serializer):
        biz = serializer.save()
        if getattr(biz, "category_id", None):
            recalc_category_counts({biz.category_id})
        # SEO signals (if any) handled elsewhere

    def _guess_submitter_email(self, biz: Business) -> str | None:
        for candidate in (
            getattr(biz, "created_by_email", None),
            getattr(getattr(biz, "created_by", None), "email", None),
            getattr(biz, "created_by", None) if isinstance(getattr(biz, "created_by", None), str) else None,
        ):
            if candidate:
                return candidate
        return None

    def _truthy(self, value):
        if value is None:
            return False
        return str(value).strip().lower() in ("1", "true", "yes", "on")

    def perform_update(self, serializer):
        instance: Business = self.get_object()
        prev_status = instance.status
        prev_category_id = instance.category_id

        biz = serializer.save()

        if hasattr(biz, "updated_at"):
            Business.objects.filter(pk=biz.pk).update(updated_at=timezone.now())

        affected = set()
        if prev_category_id != biz.category_id:
            if prev_category_id:
                affected.add(prev_category_id)
            if biz.category_id:
                affected.add(biz.category_id)
        elif prev_status != biz.status and getattr(biz, "category_id", None):
            affected.add(biz.category_id)
        if affected:
            recalc_category_counts(affected)

        notify = self._truthy(self.request.query_params.get("notify"))
        if prev_status != "active" and biz.status == "active" and notify:
            recipient = self._guess_submitter_email(biz)
            try:
                email_business_approved(biz, recipient)
            except Exception:
                pass

    # ---------- Public read by slug (flat) ----------
    @action(detail=False, url_path=r"by-slug/(?P<slug>[^/]+)", methods=["get"])
    def by_slug(self, request, slug=None):
        """
        Resolve a listing by slug.
        First try Business; if not found, fall back to Doctor so
        /api/businesses/by-slug/<slug>/ works for both worlds.
        """
        # 1) Try Business
        try:
            obj = self.get_queryset().get(slug=slug)
            return Response(self.get_serializer(obj).data)
        except Business.DoesNotExist:
            pass

        # 2) Fallback: Doctor
        try:
            doc = (
                Doctor.objects.only(
                    "id", "provider_name", "specialty", "slug", "status",
                    "description", "insurances", "popular_visit_reasons",
                    "street_address", "city", "state", "zip",
                    "practice_names", "educations",
                    "languages", "gender", "npi_number",
                    "website", "phone", "image_url",
                    "email", "works_for",  # include new simple fields
                    "category_id", "claimed_by_id", "pending_claim_by_id",
                    "claimed_at", "pending_claim_notes", "pending_claim_requested_at",
                    "is_premium", "premium_expires", "average_rating", "total_reviews",
                    "created_at", "updated_at",
                )
                .select_related("category")
                .get(slug=slug)
            )
            data = DoctorSerializer(doc).data
            return Response(data, status=status.HTTP_200_OK)
        except Doctor.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    # ---------- Public read by hierarchical path ----------
    @action(detail=False, url_path=r"by-path/(?P<catpath>.+)/(?P<bizslug>[^/]+)", methods=["get"])
    def by_path(self, request, catpath=None, bizslug=None):
        catpath = (catpath or "").strip("/")

        # ----- Business attempts -----
        # 1) exact category
        cat = Category.objects.filter(full_slug=catpath).first()
        if cat:
            obj = self.get_queryset().filter(category=cat, slug=bizslug).first()
            if obj:
                return Response(self.get_serializer(obj).data)

        # 2) case-insensitive
        cat = Category.objects.filter(full_slug__iexact=catpath).first()
        if cat:
            obj = self.get_queryset().filter(category=cat, slug=bizslug).first()
            if obj:
                return Response(self.get_serializer(obj).data)

        # 3) ancestor prefix
        obj = self.get_queryset().filter(
            slug=bizslug,
            category__full_slug__istartswith=catpath
        ).first()
        if obj:
            return Response(self.get_serializer(obj).data)

        # 4) last segment fallback
        last_seg = catpath.split("/")[-1]
        cat2 = Category.objects.filter(slug=last_seg).first()
        if cat2:
            obj = self.get_queryset().filter(category=cat2, slug=bizslug).first()
            if obj:
                return Response(self.get_serializer(obj).data)

        # ----- Doctor fallback (same tolerance) -----
        dqs = (
            Doctor.objects.only(
                "id", "provider_name", "specialty", "slug", "status",
                "description", "insurances", "popular_visit_reasons",
                "street_address", "city", "state", "zip",
                "practice_names", "educations",
                "languages", "gender", "npi_number",
                "website", "phone", "image_url",
                "email", "works_for",
                "category_id", "claimed_by_id", "pending_claim_by_id",
                "claimed_at", "pending_claim_notes", "pending_claim_requested_at",
                "is_premium", "premium_expires", "average_rating", "total_reviews",
                "created_at", "updated_at",
            )
            .select_related("category")
        )

        # D1 exact category
        cat = Category.objects.filter(full_slug=catpath).first()
        if cat:
            d = dqs.filter(category=cat, slug=bizslug).first()
            if d:
                return Response(DoctorSerializer(d).data)

        # D2 case-insensitive
        cat = Category.objects.filter(full_slug__iexact=catpath).first()
        if cat:
            d = dqs.filter(category=cat, slug=bizslug).first()
            if d:
                return Response(DoctorSerializer(d).data)

        # D3 ancestor prefix
        d = dqs.filter(slug=bizslug, category__full_slug__istartswith=catpath).first()
        if d:
            return Response(DoctorSerializer(d).data)

        # D4 last segment
        cat2 = Category.objects.filter(slug=last_seg).first()
        if cat2:
            d = dqs.filter(category=cat2, slug=bizslug).first()
            if d:
                return Response(DoctorSerializer(d).data)

        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=["post"], permission_classes=[IsAdminUser])
    def set_owner(self, request, pk=None):
        biz = self.get_object()
        user_id = request.data.get("user_id", None)

        if user_id in (None, "", "null"):
            biz.claimed_by = None
            biz.claimed_at = None
        else:
            try:
                owner = User.objects.get(pk=int(user_id))
            except Exception:
                return Response({"detail": "Invalid user_id."}, status=400)
            biz.claimed_by = owner
            biz.claimed_at = timezone.now()

        biz.pending_claim_by = None
        biz.pending_claim_notes = None
        biz.pending_claim_requested_at = None
        biz.updated_at = timezone.now()
        biz.save()

        return Response(self.get_serializer(biz).data, status=200)

    # ---------- BULK SET CATEGORY (admin) ----------
    @action(detail=False, methods=["post"], permission_classes=[IsAdminUser])
    def bulk_set_category(self, request):
        """
        Admin-only: Move many businesses into a new category in one operation.
        Rules:
          - All selected businesses must belong to the same MAIN category (root of full_slug).
          - Destination must be a SUBCATEGORY under that same main (no main→main).
        """
        data = request.data or {}

        ids = data.get("ids")
        from_category_id = data.get("from_category_id")
        to_category_id = data.get("to_category_id")
        dry_run = str(data.get("dry_run", "0")).strip().lower() in ("1", "true", "yes", "on")
        refresh_seo = str(data.get("refresh_seo", "0")).strip().lower() in ("1", "true", "yes", "on")

        if not to_category_id:
            return Response({"detail": "to_category_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        # Validate destination category
        try:
            to_cat = Category.objects.only("id", "full_slug").get(pk=int(to_category_id))
        except Exception:
            return Response({"detail": "Invalid to_category_id."}, status=status.HTTP_400_BAD_REQUEST)

        # Destination must be a subcategory (not main)
        if "/" not in (to_cat.full_slug or ""):
            return Response(
                {"detail": "Destination must be a subcategory (no main→main allowed)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Build queryset of candidates
        qs = Business.objects.all()

        # Scope by ids OR from_category_id (both can narrow)
        if ids:
            try:
                ids = [int(x) for x in ids]
            except Exception:
                return Response({"detail": "ids must be a list of integers."}, status=status.HTTP_400_BAD_REQUEST)
            qs = qs.filter(id__in=ids)

        if from_category_id:
            try:
                from_category_id = int(from_category_id)
            except Exception:
                return Response({"detail": "from_category_id must be an integer."}, status=status.HTTP_400_BAD_REQUEST)
            qs = qs.filter(category_id=from_category_id)

        # Optional filters
        opt_filters = data.get("filters") or {}
        if isinstance(opt_filters, dict):
            if "status" in opt_filters and str(opt_filters["status"]).strip():
                qs = qs.filter(status=str(opt_filters["status"]).strip())
            if "city" in opt_filters and str(opt_filters["city"]).strip():
                qs = qs.filter(city__iexact=str(opt_filters["city"]).strip())
            if "state" in opt_filters and str(opt_filters["state"]).strip():
                qs = qs.filter(state__iexact=str(opt_filters["state"]).strip())

        total = qs.count()

        if total == 0:
            if dry_run:
                return Response({
                    "dry_run": True,
                    "count": 0,
                    "to_category_id": to_cat.id,
                    "from_category_id": from_category_id,
                })
            return Response({"moved": 0, "to_category_id": to_cat.id, "from_category_id": from_category_id})

        # Validate SAME MAIN constraint
        src_cat_ids = list(qs.values_list("category_id", flat=True).distinct())
        src_cats = {c.id: c for c in Category.objects.filter(id__in=src_cat_ids).only("id", "full_slug")}
        def root_of(cat_full_slug: str) -> str:
            fs = (cat_full_slug or "").strip()
            return fs.split("/")[0] if fs else ""
        src_roots = {root_of(src_cats.get(cid).full_slug) for cid in src_cat_ids if cid in src_cats}
        if len(src_roots) == 0:
            return Response(
                {"detail": "Selected listings have no valid category; cannot determine main category."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(src_roots) > 1:
            return Response(
                {"detail": "Selected listings span multiple main categories. Split your selection and retry."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        src_root = next(iter(src_roots))
        dest_root = root_of(to_cat.full_slug)

        if src_root != dest_root:
            return Response(
                {"detail": "Destination subcategory is under a different main category. This move is not allowed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if dry_run:
            return Response({
                "dry_run": True,
                "count": total,
                "to_category_id": to_cat.id,
                "from_category_id": from_category_id,
                "main_category": src_root,
            })

        # Pre-capture ids for optional SEO refresh
        id_list = list(qs.values_list("id", flat=True))

        # Compute affected categories for recounts (old + new)
        affected_before = set(src_cat_ids)
        affected_before.add(to_cat.id)

        # Move in chunks; keep memory low and update updated_at
        CHUNK = 5000
        moved = 0
        now_ts = timezone.now()

        with transaction.atomic():
            if ids and len(ids) > CHUNK:
                for i in range(0, len(ids), CHUNK):
                    batch_ids = ids[i:i + CHUNK]
                    count = Business.objects.filter(id__in=batch_ids).update(
                        category_id=to_cat.id, updated_at=now_ts
                    )
                    moved += count
            else:
                moved = qs.update(category_id=to_cat.id, updated_at=now_ts)

        # Recalc business_count for affected categories (old + new)
        try:
            recalc_category_counts(affected_before)
        except Exception:
            pass

        # Optional: refresh SEO
        if ensure_business_meta and refresh_seo and moved > 0:
            try:
                for chunk_start in range(0, len(id_list), CHUNK):
                    chunk_ids = id_list[chunk_start:chunk_start + CHUNK]
                    for b in Business.objects.filter(id__in=chunk_ids).only(
                        "id", "name", "city", "state", "category_id", "slug"
                    ):
                        try:
                            ensure_business_meta(b, refresh=True)
                        except Exception:
                            pass
            except Exception:
                pass

        return Response({
            "moved": moved,
            "to_category_id": to_cat.id,
            "from_category_id": from_category_id,
            "main_category": src_root,
        }, status=status.HTTP_200_OK)

    # ---------- BULK CREATE ----------
    @action(detail=False, methods=["post"], permission_classes=[AllowAny])
    def bulk_create(self, request):
        items = request.data.get("items", [])
        if not isinstance(items, list):
            return Response({"detail": "items must be a list"}, status=status.HTTP_400_BAD_REQUEST)
        if not items:
            return Response({"created": 0}, status=status.HTTP_201_CREATED)

        got_lock = False
        LOCK_KEY = 812345
        if connection.vendor == "postgresql":
            try:
                with connection.cursor() as cur:
                    cur.execute("SELECT pg_try_advisory_lock(%s)", [LOCK_KEY])
                    got_lock = bool(cur.fetchone()[0])
                if not got_lock:
                    return Response(
                        {"detail": "Another bulk import is currently running. Try again later."},
                        status=status.HTTP_409_CONFLICT,
                    )
            except Exception:
                got_lock = False

        try:
            t_validate_start = time.perf_counter()
            serializer = self.get_serializer(data=items, many=True)
            serializer.is_valid(raise_exception=True)
            t_validate = time.perf_counter() - t_validate_start

            now_ts = timezone.now()
            objs = []
            slugs = []
            for validated in serializer.validated_data:
                name = validated.get("name") or "business"
                base = slugify(name) or "business"
                slug = f"{base}-{uuid.uuid4().hex[:8]}"
                slugs.append(slug)
                objs.append(Business(
                    **validated,
                    slug=slug,
                    created_at=now_ts,
                    updated_at=now_ts,
                ))

            # Only count 'active' into category business_count
            deltas: dict[int, int] = {}
            for o in objs:
                if getattr(o, "status", None) == "active" and getattr(o, "category_id", None):
                    deltas[o.category_id] = deltas.get(o.category_id, 0) + 1

            t_insert_start = time.perf_counter()
            Business.objects.bulk_create(objs, ignore_conflicts=True, batch_size=5000)
            t_insert = time.perf_counter() - t_insert_start

            for cid, inc in deltas.items():
                Category.objects.filter(id=cid).update(
                    business_count=F("business_count") + inc
                )

            # Auto-create SEO for newly inserted businesses (optional)
            if ensure_business_meta and slugs:
                CHUNK = 5000
                try:
                    for i in range(0, len(slugs), CHUNK):
                        chunk = slugs[i:i + CHUNK]
                        for b in Business.objects.filter(slug__in=chunk).only(
                            "id", "name", "city", "state", "category_id", "slug"
                        ):
                            try:
                                ensure_business_meta(b, refresh=True)
                            except Exception:
                                pass
                except Exception:
                    pass

            recalc_param = str(request.query_params.get("recalc", "0")).strip().lower()
            do_recalc = recalc_param in ("1", "true", "yes", "on")
            if do_recalc:
                cat_ids = {getattr(o, "category_id", None) for o in objs if getattr(o, "category_id", None)}
                if cat_ids:
                    recalc_category_counts(cat_ids)

            try:
                log.info(
                    "bulk_create: items=%d validate=%.3fs insert=%.3fs recalc=%s",
                    len(items), t_validate, t_insert, do_recalc
                )
            except Exception:
                pass

            return Response({"created": len(objs)}, status=status.HTTP_201_CREATED)

        except DatabaseError as e:
            msg = str(e)
            lowered = msg.lower()
            is_timeout = (
                "statement timeout" in lowered
                or "canceling statement due to" in lowered
                or "lock timeout" in lowered
            )
            code = status.HTTP_503_SERVICE_UNAVAILABLE if is_timeout else status.HTTP_500_INTERNAL_SERVER_ERROR
            traceback.print_exc()
            return Response({"detail": "Database is busy; please retry later.", "error": msg}, status=code)
        finally:
            if connection.vendor == "postgresql" and got_lock:
                try:
                    with connection.cursor() as cur:
                        cur.execute("SELECT pg_advisory_unlock(%s)", [LOCK_KEY])
                except Exception:
                    pass


# -------------------- Doctor (Providers) --------------------
class DoctorViewSet(_ClaimMixin, viewsets.ModelViewSet):
    queryset = (
        Doctor.objects.only(
            "id", "provider_name", "specialty", "slug", "status",
            # NEW fields
            "email",
            "works_for",  # CHANGED: simple URL
            "description", "insurances", "popular_visit_reasons",
            "street_address", "city", "state", "zip",
            "practice_names", "educations",
            "languages", "gender", "npi_number",
            "website", "phone", "image_url",
            "category_id", "claimed_by_id", "pending_claim_by_id",
            "claimed_at", "pending_claim_notes", "pending_claim_requested_at",
            "is_premium", "premium_expires", "average_rating", "total_reviews",
            "created_at", "updated_at",
        )
        .select_related("category")
        .order_by("-updated_at")
    )
    serializer_class = DoctorSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter, filters.SearchFilter]
    filterset_class = DoctorFilter
    ordering_fields = ["updated_at", "created_at", "average_rating", "total_reviews", "is_premium"]
    search_fields = [
        "provider_name", "specialty",
        "description", "insurances", "popular_visit_reasons",
        "practice_names", "educations",
        "languages", "gender", "npi_number",
        "street_address", "city", "state", "zip",
        "website", "phone", "email",  # NEW
        "category__name", "category__full_slug",
    ]

    # Fields owner may edit while claiming
    OWNER_EDITABLE_FIELDS = {
        "phone", "website", "image_url",
        "description", "insurances", "popular_visit_reasons",
        "street_address", "city", "state", "zip",
        "practice_names", "educations", "languages", "gender", "npi_number",
        "specialty",
        "email",        # NEW
        "works_for",    # CHANGED: simple URL
    }

    def get_permissions(self):
        if self.action == "bulk_create":
            return [AllowAny()]  # switch to IsAdminUser() if you want to restrict
        if self.action in ["bulk_set_category"]:
            return [IsAdminUser()]
        if self.action in ["create"]:
            return [IsAuthenticated()]
        if self.action in ["update", "partial_update", "destroy",
                           "approve_claim", "reject_claim", "set_owner"]:
            return [IsAdminUser()]
        if self.action in ["claim"]:
            return [IsAuthenticated()]
        return [AllowAny()]

    @action(detail=False, methods=["get"])
    def featured(self, request):
        qs = (
            self.filter_queryset(self.get_queryset())
            .filter(status="active")
            .order_by("-average_rating")[:8]
        )
        return Response(self.get_serializer(qs, many=True).data)

    @action(detail=False, url_path=r"by-slug/(?P<slug>[^/]+)", methods=["get"])
    def by_slug(self, request, slug=None):
        try:
            obj = self.get_queryset().get(slug=slug)
        except Doctor.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(self.get_serializer(obj).data)

    @action(detail=False, url_path=r"by-path/(?P<catpath>.+)/(?P<docslug>[^/]+)", methods=["get"])
    def by_path(self, request, catpath=None, docslug=None):
        catpath = (catpath or "").strip("/")
        try:
            cat = Category.objects.get(full_slug=catpath)
            obj = self.get_queryset().get(category=cat, slug=docslug)
        except (Category.DoesNotExist, Doctor.DoesNotExist):
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(self.get_serializer(obj).data)

    @action(detail=True, methods=["post"], permission_classes=[IsAdminUser])
    def set_owner(self, request, pk=None):
        doc = self.get_object()
        user_id = request.data.get("user_id", None)
        if user_id in (None, "", "null"):
            doc.claimed_by = None
            doc.claimed_at = None
        else:
            try:
                owner = User.objects.get(pk=int(user_id))
            except Exception:
                return Response({"detail": "Invalid user_id."}, status=400)
            doc.claimed_by = owner
            doc.claimed_at = timezone.now()

        doc.pending_claim_by = None
        doc.pending_claim_notes = None
        doc.pending_claim_requested_at = None
        doc.updated_at = timezone.now()
        doc.save()
        return Response(self.get_serializer(doc).data, status=200)

    # ---------- BULK CREATE (doctors) ----------
    @action(detail=False, methods=["post"])
    def bulk_create(self, request):
        """
        Accepts either:
          - {"items": [ {doctor fields...}, ... ]}
          - [ {doctor fields...}, ... ]
        Returns: {"created": N}
        """
        payload = request.data
        items = payload.get("items") if isinstance(payload, dict) else payload
        if not isinstance(items, list):
            return Response({"detail": "items must be a list"}, status=status.HTTP_400_BAD_REQUEST)
        if not items:
            return Response({"created": 0}, status=status.HTTP_201_CREATED)

        try:
            serializer = self.get_serializer(data=items, many=True)
            serializer.is_valid(raise_exception=True)

            now_ts = timezone.now()
            objs = []
            for vd in serializer.validated_data:
                base_name = vd.get("provider_name") or "provider"
                base = slugify(base_name) or "provider"
                slug = f"{base}-{uuid.uuid4().hex[:8]}"
                objs.append(
                    Doctor(
                        **vd,
                        slug=slug,
                        created_at=now_ts,
                        updated_at=now_ts,
                    )
                )

            Doctor.objects.bulk_create(objs, ignore_conflicts=True, batch_size=5000)
            return Response({"created": len(objs)}, status=status.HTTP_201_CREATED)

        except DatabaseError as e:
            msg = str(e)
            lowered = msg.lower()
            is_timeout = ("statement timeout" in lowered or
                          "canceling statement due to" in lowered or
                          "lock timeout" in lowered)
            code = status.HTTP_503_SERVICE_UNAVAILABLE if is_timeout else status.HTTP_500_INTERNAL_SERVER_ERROR
            return Response({"detail": "Database is busy; please retry later.", "error": msg}, status=code)

    # ---------- BULK SET CATEGORY (admin) ----------
    @action(detail=False, methods=["post"], permission_classes=[IsAdminUser])
    def bulk_set_category(self, request):
        """
        Admin-only: move many doctors to a new category in one operation.
        Rules (mirrors Business bulk_set_category):
          - All selected doctors must share the same MAIN category (root of full_slug).
          - Destination must be a SUBCATEGORY under that same main (no main→main).
        """
        data = request.data or {}

        ids = data.get("ids")
        from_category_id = data.get("from_category_id")
        to_category_id = data.get("to_category_id")
        dry_run = str(data.get("dry_run", "0")).strip().lower() in ("1", "true", "yes", "on")

        if not to_category_id:
            return Response({"detail": "to_category_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            to_cat = Category.objects.only("id", "full_slug").get(pk=int(to_category_id))
        except Exception:
            return Response({"detail": "Invalid to_category_id."}, status=status.HTTP_400_BAD_REQUEST)

        if "/" not in (to_cat.full_slug or ""):
            return Response(
                {"detail": "Destination must be a subcategory (no main→main allowed)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        qs = Doctor.objects.all()

        if ids:
            try:
                ids = [int(x) for x in ids]
            except Exception:
                return Response({"detail": "ids must be a list of integers."}, status=status.HTTP_400_BAD_REQUEST)
            qs = qs.filter(id__in=ids)

        if from_category_id:
            try:
                from_category_id = int(from_category_id)
            except Exception:
                return Response({"detail": "from_category_id must be an integer."}, status=status.HTTP_400_BAD_REQUEST)
            qs = qs.filter(category_id=from_category_id)

        opt_filters = data.get("filters") or {}
        if isinstance(opt_filters, dict):
            if "status" in opt_filters and str(opt_filters["status"]).strip():
                qs = qs.filter(status=str(opt_filters["status"]).strip())
            if "city" in opt_filters and str(opt_filters["city"]).strip():
                qs = qs.filter(city__iexact=str(opt_filters["city"]).strip())
            if "state" in opt_filters and str(opt_filters["state"]).strip():
                qs = qs.filter(state__iexact=str(opt_filters["state"]).strip())

        total = qs.count()
        if total == 0:
            if dry_run:
                return Response({
                    "dry_run": True,
                    "count": 0,
                    "to_category_id": to_cat.id,
                    "from_category_id": from_category_id,
                })
            return Response({"moved": 0, "to_category_id": to_cat.id, "from_category_id": from_category_id})

        src_cat_ids = list(qs.values_list("category_id", flat=True).distinct())
        src_cats = {c.id: c for c in Category.objects.filter(id__in=src_cat_ids).only("id", "full_slug")}

        def root_of(cat_full_slug: str) -> str:
            fs = (cat_full_slug or "").strip()
            return fs.split("/")[0] if fs else ""

        src_roots = {root_of(src_cats.get(cid).full_slug) for cid in src_cat_ids if cid in src_cats}
        if len(src_roots) == 0:
            return Response(
                {"detail": "Selected listings have no valid category; cannot determine main category."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(src_roots) > 1:
            return Response(
                {"detail": "Selected listings span multiple main categories. Split your selection and retry."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        src_root = next(iter(src_roots))
        dest_root = root_of(to_cat.full_slug)
        if src_root != dest_root:
            return Response(
                {"detail": "Destination subcategory is under a different main category. This move is not allowed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if dry_run:
            return Response({
                "dry_run": True,
                "count": total,
                "to_category_id": to_cat.id,
                "from_category_id": from_category_id,
                "main_category": src_root,
            })

        CHUNK = 5000
        moved = 0
        now_ts = timezone.now()
        if ids and len(ids) > CHUNK:
            for i in range(0, len(ids), CHUNK):
                batch_ids = ids[i:i + CHUNK]
                moved += Doctor.objects.filter(id__in=batch_ids).update(
                    category_id=to_cat.id, updated_at=now_ts
                )
        else:
            moved = qs.update(category_id=to_cat.id, updated_at=now_ts)

        return Response({
            "moved": moved,
            "to_category_id": to_cat.id,
            "from_category_id": from_category_id,
            "main_category": src_root,
        }, status=status.HTTP_200_OK)


# -------------------- Unified Directory Search --------------------
@api_view(["GET"])
@permission_classes([AllowAny])
def unified_search(request):
    """
    Mixed directory search across Business (lawyers) + Doctor (providers).

    Accepts:
      q                : optional query string (if blank, returns filtered lists)
      category_id      : optional int (filters both models)
      category_path    : optional path prefix, matches Category.full_slug startswith
      status           : optional status filter (e.g., 'active')
      city             : optional city substring (case-insensitive)
      state            : optional 2-letter code (case-insensitive exact)
      is_premium       : optional truthy flag ('1', 'true', 'True') to require premium
      limit, offset    : pagination (combined across both models)

    Returns:
      { "items": [ {type: "lawyer"|"doctor", rank: int, data: <serializer> }, ... ] }
    """
    q = (request.query_params.get("q") or "").strip()
    limit = int(request.query_params.get("limit", 20))
    offset = int(request.query_params.get("offset", 0))
    status_filter = (request.query_params.get("status") or "").strip()
    category_id = request.query_params.get("category_id")
    category_path = (request.query_params.get("category_path") or "").strip()

    city = (request.query_params.get("city") or "").strip()
    state = (request.query_params.get("state") or "").strip()
    is_premium_param = (request.query_params.get("is_premium") or "").strip().lower()
    want_premium = is_premium_param in {"1", "true", "yes", "on"}

    # Common filters for both querysets
    b_filters = {}
    d_filters = {}

    if status_filter:
        b_filters["status"] = status_filter
        d_filters["status"] = status_filter

    if category_id:
        try:
            cid = int(category_id)
            b_filters["category_id"] = cid
            d_filters["category_id"] = cid
        except (TypeError, ValueError):
            pass

    if category_path:
        b_filters["category__full_slug__startswith"] = category_path
        d_filters["category__full_slug__startswith"] = category_path

    if city:
        b_filters["city__icontains"] = city
        d_filters["city__icontains"] = city

    if state:
        # state is typically a two-letter code; match case-insensitively
        b_filters["state__iexact"] = state
        d_filters["state__iexact"] = state

    if want_premium:
        b_filters["is_premium"] = True
        d_filters["is_premium"] = True

    # Base querysets
    bqs = Business.objects.filter(**b_filters).select_related("category")
    dqs = Doctor.objects.filter(**d_filters).select_related("category")

    # Default premium/quality recency ordering
    default_order = ["-is_premium", "-average_rating", "-updated_at"]

    if q:
        # Lawyers: text match + rank
        bqs = bqs.filter(
            Q(name__icontains=q) |
            Q(description__icontains=q) |
            Q(practice_areas__icontains=q) |
            Q(city__icontains=q) | Q(state__icontains=q) | Q(zip__icontains=q) |
            Q(category__name__icontains=q) | Q(category__full_slug__icontains=q)
        ).annotate(
            rank=(
                Case(When(name__iexact=q, then=Value(100)), default=Value(0), output_field=IntegerField()) +
                Case(When(name__istartswith=q, then=Value(60)), default=Value(0), output_field=IntegerField()) +
                Case(When(name__icontains=q, then=Value(40)), default=Value(0), output_field=IntegerField()) +
                Case(When(practice_areas__icontains=q, then=Value(20)), default=Value(0), output_field=IntegerField()) +
                Case(When(description__icontains=q, then=Value(10)), default=Value(0), output_field=IntegerField())
            )
        ).order_by("-rank", *default_order)

        # Doctors: text match + rank
        dqs = dqs.filter(
            Q(provider_name__icontains=q) |
            Q(specialty__icontains=q) |
            Q(description__icontains=q) |
            Q(city__icontains=q) | Q(state__icontains=q) | Q(zip__icontains=q) |
            Q(npi_number__icontains=q) |
            Q(category__name__icontains=q) | Q(category__full_slug__icontains=q)
        ).annotate(
            rank=(
                Case(When(provider_name__iexact=q, then=Value(100)), default=Value(0), output_field=IntegerField()) +
                Case(When(provider_name__istartswith=q, then=Value(60)), default=Value(0), output_field=IntegerField()) +
                Case(When(provider_name__icontains=q, then=Value(40)), default=Value(0), output_field=IntegerField()) +
                Case(When(specialty__icontains=q, then=Value(20)), default=Value(0), output_field=IntegerField()) +
                Case(When(description__icontains=q, then=Value(10)), default=Value(0), output_field=IntegerField())
            )
        ).order_by("-rank", *default_order)
    else:
        # No query: just apply default order; synthesize rank=0 in Python
        bqs = bqs.order_by(*default_order)
        dqs = dqs.order_by(*default_order)

    # To paginate mixed results, grab enough from each set, then merge/sort.
    need = max(0, limit + offset)
    b_list = list(bqs[:need])
    d_list = list(dqs[:need])

    items = []

    # Lawyers
    for b in b_list:
        items.append({
            "type": "lawyer",
            "rank": getattr(b, "rank", 0),
            "data": BusinessSerializer(b).data,
        })

    # Doctors
    for d in d_list:
        items.append({
            "type": "doctor",
            "rank": getattr(d, "rank", 0),
            "data": DoctorSerializer(d).data,
        })

    # Combined sort: rank desc (when q), premium, rating, updated_at
    def sort_key(x):
        d = x["data"]
        return (
            x.get("rank", 0),
            1 if d.get("is_premium") else 0,
            float(d.get("average_rating") or 0.0),
            d.get("updated_at") or "",
        )

    items.sort(key=sort_key, reverse=True)

    # Final slice
    items_page = items[offset:offset + limit]

    return Response({"items": items_page})
