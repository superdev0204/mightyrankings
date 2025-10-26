from django.core.exceptions import FieldError
from django.utils import timezone
from django.db.models import F
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import SAFE_METHODS, BasePermission, IsAuthenticated, IsAdminUser
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import F, Q
from django.contrib.contenttypes.models import ContentType
from businesses.models import Business, Doctor 

from .models import Review, ReviewFlag
from .serializers import ReviewSerializer, ReviewFlagSerializer
from utils.email_utils import email_review_approved, email_owner_new_review


def _is_admin(user) -> bool:
    return bool(
        getattr(user, "is_superuser", False)
        or getattr(user, "is_staff", False)
        or getattr(user, "user_type", "") == "admin"
    )


def _is_business_owner(user, review: Review) -> bool:
    business = getattr(review, "business", None)
    if not (user and user.is_authenticated and business):
        return False
    claimed_by_id = getattr(business, "claimed_by_id", None)
    if claimed_by_id and claimed_by_id == user.id:
        return True
    return False


class IsAuthorOrAdminOrReadOnly(BasePermission):
    def has_object_permission(self, request, view, obj: Review):
        if request.method in SAFE_METHODS:
            return True
        if not request.user or not request.user.is_authenticated:
            return False
        if _is_admin(request.user):
            return True
        return obj.user_id == request.user.id


class SafeOrderingFilter(filters.OrderingFilter):
    def filter_queryset(self, request, queryset, view):
        try:
            return super().filter_queryset(request, queryset, view)
        except FieldError:
            return queryset  # fall back to default ordering


class ReviewViewSet(viewsets.ModelViewSet):
    queryset = (
        Review.objects
        .select_related('user', 'business')
        .prefetch_related('flags')
        .all()
        .order_by('-created_at')
    )
    serializer_class = ReviewSerializer
    permission_classes = [IsAuthorOrAdminOrReadOnly]
    filter_backends = [DjangoFilterBackend, SafeOrderingFilter]

    # keep default field filters for status/user;
    # business is handled both via legacy FK and generic
    filterset_fields = {
        'user': ['exact'],
        'status': ['exact'],
    }

    ordering_fields = ['created_at', 'updated_at', 'rating']
    ordering = ['-created_at']

    def get_queryset(self):
        qs = super().get_queryset()

        # virtual filters from query params
        business_id = self.request.query_params.get('business')
        doctor_id = self.request.query_params.get('doctor')

        if business_id:
            try:
                bid = int(business_id)
            except (TypeError, ValueError):
                return qs.none()
            ct_business = ContentType.objects.get_for_model(Business)
            qs = qs.filter(
                Q(business_id=bid) | Q(content_type=ct_business, object_id=bid)
            )

        if doctor_id:
            try:
                did = int(doctor_id)
            except (TypeError, ValueError):
                return qs.none()
            ct_doctor = ContentType.objects.get_for_model(Doctor)
            qs = qs.filter(content_type=ct_doctor, object_id=did)

        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=False, methods=['get'])
    def recent(self, request):
        qs = self.filter_queryset(self.get_queryset()).filter(status='active').order_by('-created_at')[:6]
        return Response(self.get_serializer(qs, many=True).data)

    def _reviewer_email(self, review):
        email = getattr(getattr(review, 'user', None), 'email', None)
        if email:
            return email
        for candidate in (
            getattr(review, "created_by_email", None),
            getattr(getattr(review, "created_by", None), "email", None),
            getattr(review, "created_by", None) if isinstance(getattr(review, "created_by", None), str) else None,
        ):
            if candidate:
                return candidate
        return None

    def _owner_email(self, business):
        for candidate in (
            getattr(business, "claimed_by_email", None),
            getattr(getattr(business, "claimed_by", None), "email", None),
        ):
            if candidate:
                return candidate
        return None

    def perform_update(self, serializer):
        instance = self.get_object()
        prev_status = instance.status
        review = serializer.save()
        new_status = review.status

        if prev_status != 'active' and new_status == 'active':
            business = getattr(review, "business", None)

            # Notify reviewer
            try:
                reviewer_email = self._reviewer_email(review)
                if reviewer_email and business:
                    email_review_approved(review, business, reviewer_email)
            except Exception:
                pass

            # Notify owner if claimed
            try:
                if business:
                    owner_email = self._owner_email(business)
                    if owner_email:
                        email_owner_new_review(business, owner_email, review=review)
            except Exception:
                pass

    # ---------- Owner/Admin reply management ----------

    @action(detail=True, methods=['post'], url_path='reply')
    def reply(self, request, pk=None):
        review = self.get_object()
        user = request.user
        if not user or not user.is_authenticated:
            return Response({'detail': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)
        if not (_is_admin(user) or _is_business_owner(user, review)):
            return Response({'detail': 'Only the business owner or an admin can reply.'}, status=status.HTTP_403_FORBIDDEN)

        content = (request.data.get('content') or '').strip()
        if not content:
            return Response({'detail': 'Reply content is required.'}, status=status.HTTP_400_BAD_REQUEST)

        review.owner_reply = content
        review.owner_replied_at = timezone.now()
        review.owner_replied_by = user
        review.save(update_fields=['owner_reply', 'owner_replied_at', 'owner_replied_by'])

        return Response(self.get_serializer(review).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='delete_reply')
    def delete_reply(self, request, pk=None):
        review = self.get_object()
        user = request.user
        if not user or not user.is_authenticated:
            return Response({'detail': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)
        if not (_is_admin(user) or _is_business_owner(user, review)):
            return Response({'detail': 'Only the business owner or an admin can delete the reply.'}, status=status.HTTP_403_FORBIDDEN)

        review.owner_reply = ''
        review.owner_replied_at = None
        review.owner_replied_by = None
        review.save(update_fields=['owner_reply', 'owner_replied_at', 'owner_replied_by'])

        return Response(self.get_serializer(review).data, status=status.HTTP_200_OK)

    # ---------- Helpful / Flag actions ----------

    @action(detail=True, methods=['post'], url_path='helpful')
    def helpful(self, request, pk=None):
        review = self.get_object()
        Review.objects.filter(pk=review.pk).update(
            helpful_count=F('helpful_count') + 1,
            updated_at=timezone.now(),
        )
        review.refresh_from_db()
        return Response(self.get_serializer(review).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def flag(self, request, pk=None):
        """
        Any authenticated user can flag a review with an optional note (reason).
        Flags set review.status = 'flagged' the first time it’s flagged.
        """
        review = self.get_object()
        note = (request.data.get('note') or '').strip() or None

        ReviewFlag.objects.create(
            review=review,
            flagged_by=request.user if request.user.is_authenticated else None,
            note=note,
        )

        if review.status != 'flagged':
            review.status = 'flagged'
            review.save(update_fields=['status'])

        # return the updated review payload (includes flag_count)
        return Response(self.get_serializer(review).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'], permission_classes=[IsAdminUser])
    def flags(self, request, pk=None):
        """
        Admin-only: detailed list of flag records for a review.
        Returns fields your admin UI expects: user_full_name, user_username, user_email, reason, created_at.
        """
        review = self.get_object()
        flags = review.flags.all().order_by('-created_at')
        data = ReviewFlagSerializer(flags, many=True).data
        return Response(data, status=status.HTTP_200_OK)
