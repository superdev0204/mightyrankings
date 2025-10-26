from django_filters import rest_framework as django_filters
from rest_framework import viewsets, permissions, filters
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.decorators import action
from rest_framework.response import Response
from django.http import HttpResponse, Http404
from django.utils.timezone import now
from django.db.models import Q, Count, Max
from urllib.parse import quote

from .models import PageMeta
from .serializers import PageMetaSerializer

# For sitemap
from categories.models import Category
from businesses.models import Business, Doctor

import html
import math


# -------------------- permissions --------------------
class IsAdminOrReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        u = request.user
        return bool(
            u
            and u.is_authenticated
            and (getattr(u, "is_superuser", False) or getattr(u, "user_type", "") == "admin")
        )


# -------------------- filters --------------------
class PageMetaFilter(django_filters.FilterSet):
    business = django_filters.NumberFilter(field_name="business", lookup_expr="exact")
    business_id = django_filters.NumberFilter(field_name="business", lookup_expr="exact")
    doctor = django_filters.NumberFilter(field_name="doctor", lookup_expr="exact")
    doctor_id = django_filters.NumberFilter(field_name="doctor", lookup_expr="exact")

    class Meta:
        model = PageMeta
        fields = ["page_name", "meta_type", "is_active", "business", "doctor"]


# -------------------- viewset --------------------
class PageMetaViewSet(viewsets.ModelViewSet):
    queryset = PageMeta.objects.all().order_by("-updated_at").only(
        "id", "page_name", "meta_type", "business_id", "doctor_id",
        "title", "description", "keywords",
        "og_title", "og_description", "og_image",
        "canonical_url", "robots", "priority", "changefreq",
        "is_active", "auto_managed", "created_at", "updated_at",
    )
    serializer_class = PageMetaSerializer
    permission_classes = [IsAdminOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter, filters.SearchFilter]
    filterset_class = PageMetaFilter
    ordering_fields = ["updated_at", "priority"]
    search_fields = ["title", "description", "og_title", "og_description"]

    @action(detail=False, methods=["GET"], url_path="by-ids")
    def by_ids(self, request):
        """
        Bulk fetch:
          /seo/page-meta/by-ids/?business_ids=1,2,3&doctor_ids=10,11
        Returns PageMeta rows for those businesses/doctors (latest first).
        """
        biz_ids = request.query_params.get("business_ids", "")
        doc_ids = request.query_params.get("doctor_ids", "")

        def parse_ids(s):
            return [int(x) for x in s.split(",") if x.strip().isdigit()]

        b_ids = parse_ids(biz_ids)
        d_ids = parse_ids(doc_ids)

        if not b_ids and not d_ids:
            return Response([])

        qs = PageMeta.objects.all().only(
            "id", "page_name", "meta_type", "business_id", "doctor_id",
            "title", "description", "keywords",
            "og_title", "og_description", "og_image",
            "canonical_url", "robots", "priority", "changefreq",
            "is_active", "auto_managed", "created_at", "updated_at",
        )

        filt = Q()
        if b_ids:
            filt |= Q(meta_type="business", business_id__in=b_ids)
        if d_ids:
            filt |= Q(meta_type="doctor", doctor_id__in=d_ids)

        qs = qs.filter(filt).order_by("-updated_at", "id")[:5000]  # safety cap
        ser = self.get_serializer(qs, many=True)
        return Response(ser.data)


# ==================== SITEMAP (index + chunks) ====================

SITEMAP_MAX_URLS = 50000  # per file


def _xml(s: str) -> str:
    return s if isinstance(s, str) else str(s)


def _xml_escape(s: str) -> str:
    """Minimal XML escape for text nodes."""
    return html.escape(_xml(s), quote=False)


def _encode_segments(path: str) -> str:
    """
    Encode each segment of a hierarchical path, preserving slashes.
    Example: "Lawyers/Personal Injury" -> "Lawyers/Personal%20Injury"
    """
    parts = [p for p in (path or "").split("/") if p]
    return "/".join(quote(p) for p in parts)


def _today():
    return now().date().isoformat()


def sitemap_index(request):
    """
    Sitemap index at /sitemap.xml
    Points to:
      /sitemaps/static.xml
      /sitemaps/categories.xml
      /sitemaps/businesses-<n>.xml (N chunks)
      /sitemaps/doctors-<n>.xml  (M chunks)
    """
    base = request.build_absolute_uri("/").rstrip("/")
    lastmod = _today()

    # Policy: index "active" entities. Broaden if needed.
    biz_count = Business.objects.filter(status="active").count()
    doc_count = Doctor.objects.filter(status="active").count()

    biz_chunks = math.ceil(biz_count / SITEMAP_MAX_URLS) if biz_count else 0
    doc_chunks = math.ceil(doc_count / SITEMAP_MAX_URLS) if doc_count else 0

    lines = []
    lines.append('<?xml version="1.0" encoding="UTF-8"?>')
    lines.append('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')

    # Static & categories
    lines.append("  <sitemap>")
    lines.append(f"    <loc>{_xml_escape(base + '/sitemaps/static.xml')}</loc>")
    lines.append(f"    <lastmod>{lastmod}</lastmod>")
    lines.append("  </sitemap>")

    lines.append("  <sitemap>")
    lines.append(f"    <loc>{_xml_escape(base + '/sitemaps/categories.xml')}</loc>")
    lines.append(f"    <lastmod>{lastmod}</lastmod>")
    lines.append("  </sitemap>")

    # Businesses chunks
    for i in range(1, biz_chunks + 1):
        lines.append("  <sitemap>")
        lines.append(f"    <loc>{_xml_escape(f'{base}/sitemaps/businesses-{i}.xml')}</loc>")
        lines.append(f"    <lastmod>{lastmod}</lastmod>")
        lines.append("  </sitemap>")

    # Doctors chunks
    for i in range(1, doc_chunks + 1):
        lines.append("  <sitemap>")
        lines.append(f"    <loc>{_xml_escape(f'{base}/sitemaps/doctors-{i}.xml')}</loc>")
        lines.append(f"    <lastmod>{lastmod}</lastmod>")
        lines.append("  </sitemap>")

    lines.append("</sitemapindex>")
    return HttpResponse("\n".join(lines), content_type="application/xml")


def sitemap_static(request):
    base = request.build_absolute_uri("/").rstrip("/")
    today = _today()

    static_pages = [
        {"url": "/",               "priority": "1.0", "changefreq": "daily"},
        {"url": "/Search",         "priority": "0.9", "changefreq": "weekly"},
        {"url": "/AddBusiness",    "priority": "0.8", "changefreq": "monthly"},
        {"url": "/Premium",        "priority": "0.8", "changefreq": "monthly"},
        {"url": "/Crowdfund",      "priority": "0.6", "changefreq": "monthly"},
        {"url": "/Compare",        "priority": "0.6", "changefreq": "monthly"},
        {"url": "/TermsOfService", "priority": "0.3", "changefreq": "yearly"},
    ]

    lines = []
    lines.append('<?xml version="1.0" encoding="UTF-8"?>')
    lines.append('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')

    for p in static_pages:
        loc = f'{base}{p["url"] if p["url"] == "/" else p["url"]}'
        lines.append("  <url>")
        lines.append(f"    <loc>{_xml_escape(loc)}</loc>")
        lines.append(f"    <lastmod>{today}</lastmod>")
        lines.append(f"    <changefreq>{p['changefreq']}</changefreq>")
        lines.append(f"    <priority>{p['priority']}</priority>")
        lines.append("  </url>")

    lines.append("</urlset>")
    return HttpResponse("\n".join(lines), content_type="application/xml")


def sitemap_categories(request):
    """
    /sitemaps/categories.xml
    Include categories that have at least one Business or Doctor.
    Compute lastmod as the max(updated_at) among related rows (fallback: today).
    """
    base = request.build_absolute_uri("/").rstrip("/")
    # today = _today()  # (not needed now)

    lines = []
    lines.append('<?xml version="1.0" encoding="UTF-8"?>')
    lines.append('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')

    # IMPORTANT: use values(...) first, then annotate(), then order_by on a selected field.
    # This produces GROUP BY on full_slug, slug (the selected non-aggregates) and avoids PG errors.
    qs = (
        Category.objects
        .values("full_slug", "slug")
        .annotate(
            b_count=Count("businesses", distinct=True),
            d_count=Count("doctors", distinct=True),
            b_last=Max("businesses__updated_at"),
            d_last=Max("doctors__updated_at"),
        )
        .order_by("full_slug")
    )

    for c in qs:
        full = (c.get("full_slug") or c.get("slug") or "").strip()
        if not full:
            continue

        total = int(c.get("b_count") or 0) + int(c.get("d_count") or 0)
        if total <= 0:
            continue  # skip empty categories

        b_last = c.get("b_last")
        d_last = c.get("d_last")
        last = b_last if (b_last and (not d_last or b_last >= d_last)) else (d_last or None)
        lastmod = (last or now()).date().isoformat()

        loc = f"{base}/{_encode_segments(full)}/"

        lines.append("  <url>")
        lines.append(f"    <loc>{_xml_escape(loc)}</loc>")
        lines.append(f"    <lastmod>{lastmod}</lastmod>")
        lines.append("    <changefreq>weekly</changefreq>")
        lines.append("    <priority>0.7</priority>")
        lines.append("  </url>")

    lines.append("</urlset>")
    return HttpResponse("\n".join(lines), content_type="application/xml")


def sitemap_businesses_chunk(request, chunk: int):
    """
    /sitemaps/businesses-<chunk>.xml (1-based)
    """
    try:
        chunk = int(chunk)
        if chunk < 1:
            raise ValueError
    except Exception:
        raise Http404("Invalid chunk")

    base = request.build_absolute_uri("/").rstrip("/")
    start = (chunk - 1) * SITEMAP_MAX_URLS
    end = start + SITEMAP_MAX_URLS

    base_qs = Business.objects.filter(status="active")
    total = base_qs.count()
    if start >= total and total != 0:
        raise Http404("Chunk out of range")

    qs = (
        base_qs
        .order_by("id")
        .values("slug", "updated_at", "created_at", "category__full_slug")[start:end]
    )

    lines = []
    lines.append('<?xml version="1.0" encoding="UTF-8"?>')
    lines.append('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')

    for b in qs:
        slug = (b.get("slug") or "").strip()
        cat_full = (b.get("category__full_slug") or "").strip()

        if cat_full and slug:
            loc = f"{base}/business/{_encode_segments(cat_full)}/{quote(slug)}"
        elif slug:
            loc = f"{base}/business/{quote(slug)}"
        else:
            continue

        last = b.get("updated_at") or b.get("created_at") or now()
        lastmod = last.date().isoformat()

        lines.append("  <url>")
        lines.append(f"    <loc>{_xml_escape(loc)}</loc>")
        lines.append(f"    <lastmod>{lastmod}</lastmod>")
        lines.append("    <changefreq>weekly</changefreq>")
        lines.append("    <priority>0.8</priority>")
        lines.append("  </url>")

    lines.append("</urlset>")
    return HttpResponse("\n".join(lines), content_type="application/xml")


def sitemap_doctors_chunk(request, chunk: int):
    """
    /sitemaps/doctors-<chunk>.xml (1-based)
    """
    try:
        chunk = int(chunk)
        if chunk < 1:
            raise ValueError
    except Exception:
        raise Http404("Invalid chunk")

    base = request.build_absolute_uri("/").rstrip("/")
    start = (chunk - 1) * SITEMAP_MAX_URLS
    end = start + SITEMAP_MAX_URLS

    base_qs = Doctor.objects.filter(status="active")
    total = base_qs.count()
    if start >= total and total != 0:
        raise Http404("Chunk out of range")

    qs = (
        base_qs
        .order_by("id")
        .values("slug", "updated_at", "created_at", "category__full_slug")[start:end]
    )

    lines = []
    lines.append('<?xml version="1.0" encoding="UTF-8"?>')
    lines.append('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')

    for d in qs:
        slug = (d.get("slug") or "").strip()
        cat_full = (d.get("category__full_slug") or "").strip()

        if cat_full and slug:
            loc = f"{base}/doctor/{_encode_segments(cat_full)}/{quote(slug)}"
        elif slug:
            loc = f"{base}/doctor/{quote(slug)}"
        else:
            continue

        last = d.get("updated_at") or d.get("created_at") or now()
        lastmod = last.date().isoformat()

        lines.append("  <url>")
        lines.append(f"    <loc>{_xml_escape(loc)}</loc>")
        lines.append(f"    <lastmod>{lastmod}</lastmod>")
        lines.append("    <changefreq>weekly</changefreq>")
        lines.append("    <priority>0.8</priority>")
        lines.append("  </url>")

    lines.append("</urlset>")
    return HttpResponse("\n".join(lines), content_type="application/xml")
