from django.db.models import OuterRef, Subquery, Count, IntegerField, F, Value
from django.db.models.functions import Coalesce
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticatedOrReadOnly

from businesses.models import Business, Doctor
from .models import Category
from .serializers import CategorySerializer
from django_filters.rest_framework import DjangoFilterBackend


class CategoryViewSet(viewsets.ModelViewSet):
    # Keep list queries light; include parent_id for breadcrumb building
    queryset = (
        Category.objects.only(
            "id", "name", "slug", "description", "icon", "color",
            "business_count", "full_slug", "parent_id"
        )
        .order_by("full_slug")
    )
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter, filters.SearchFilter]

    filterset_fields = ["name", "slug", "parent", "full_slug"]
    # NOTE: 'business_count' here is the DB column; the API returns combined count via serializer.
    ordering_fields = ["business_count", "name", "full_slug"]
    search_fields = ["name", "description", "full_slug"]

    def _with_combined_count(self, qs):
        """
        Annotate each Category with 'combined_count' = active Businesses + active Doctors.
        Uses two subqueries so we don't need schema changes or reverse related_names.
        """
        biz_sub = (
            Business.objects
            .filter(category_id=OuterRef("pk"), status="active")
            .values("category_id")
            .annotate(c=Count("id"))
            .values("c")[:1]
        )
        doc_sub = (
            Doctor.objects
            .filter(category_id=OuterRef("pk"), status="active")
            .values("category_id")
            .annotate(c=Count("id"))
            .values("c")[:1]
        )
        return qs.annotate(
            _biz_active=Coalesce(Subquery(biz_sub, output_field=IntegerField()), Value(0)),
            _doc_active=Coalesce(Subquery(doc_sub, output_field=IntegerField()), Value(0)),
            combined_count=F("_biz_active") + F("_doc_active"),
        )

    @action(detail=False, methods=["get"])
    def top(self, request):
        # Return the top 6 by combined (Business + Doctor) active listings
        qs = self._with_combined_count(self.filter_queryset(self.get_queryset()))
        qs = qs.order_by("-combined_count", "full_slug")[:6]
        # Serializer will emit 'business_count' == combined_count
        return Response(self.get_serializer(qs, many=True).data)

    @action(detail=False, url_path=r"by-slug/(?P<slug>[^/]+)", methods=["get"])
    def by_slug(self, request, slug=None):
        qs = self._with_combined_count(self.get_queryset())
        obj = qs.filter(slug=slug).first()
        if not obj:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(self.get_serializer(obj).data)

    @action(detail=False, url_path=r"by-path/(?P<path>.+)", methods=["get"])
    def by_path(self, request, path=None):
        clean = (path or "").strip("/")
        qs = self._with_combined_count(self.get_queryset())
        # exact first; then case-insensitive fallback
        obj = qs.filter(full_slug=clean).first() or qs.filter(full_slug__iexact=clean).first()
        if not obj:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(self.get_serializer(obj).data)
