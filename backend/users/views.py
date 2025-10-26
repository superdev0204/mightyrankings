from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated, IsAdminUser, AllowAny
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from .models import User
from .serializers import UserSerializer
from utils.email_utils import email_user_welcome, email_user_approved


def _is_admin(u) -> bool:
    return bool(
        getattr(u, "is_superuser", False)
        or getattr(u, "is_staff", False)
        or getattr(u, "user_type", "") == "admin"
    )


class UserViewSet(viewsets.ModelViewSet):
    """
    - Admins: full CRUD on users (including list, retrieve, update/patch/destroy)
    - Non-admin authenticated users:
        * can GET/PATCH their own record via /users/me/
        * cannot list others
        * cannot PATCH other users
        * retrieve of others is blocked by get_queryset
    """
    queryset = User.objects.all().order_by('-date_joined')
    serializer_class = UserSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = {'user_type': ['exact'], 'status': ['exact']}
    search_fields = ['email', 'username', 'full_name']
    ordering_fields = ['date_joined']

    # Restrict rows non-admins can see (blocks retrieve of others)
    def get_queryset(self):
        qs = super().get_queryset()
        u = self.request.user
        if not (u and u.is_authenticated):
            return qs.none()
        return qs if _is_admin(u) else qs.filter(pk=u.pk)

    def get_permissions(self):
        # Admin-only for these actions
        if self.action in ['list', 'destroy', 'create', 'partial_update', 'update']:
            return [IsAdminUser()]
        # Other actions (retrieve) fall back to default; queryset already restricts access
        return super().get_permissions()

    # --- ensure response shows fresh DB state ---
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        instance.refresh_from_db()
        out = self.get_serializer(instance)
        return Response(out.data, status=status.HTTP_200_OK)

    def partial_update(self, request, *args, **kwargs):
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)
    # -------------------------------------------

    def perform_create(self, serializer):
        user = serializer.save()
        try:
            email_user_welcome(user)
        except Exception:
            pass

    def perform_update(self, serializer):
        """
        Save the user; if status transitioned to active and notify is truthy,
        send the approval email.
        """
        instance: User = self.get_object()
        prev_status = instance.status
        user = serializer.save()
        new_status = user.status

        notify = self.request.query_params.get('notify', '')
        notify_truthy = str(notify).lower() in ('1', 'true', 'yes', 'on')

        if prev_status != 'active' and new_status == 'active' and notify_truthy:
            try:
                email_user_approved(user)
            except Exception:
                # don't fail the API call if email sending fails
                pass

    @action(detail=False, methods=['get', 'patch'], url_path='me',
            permission_classes=[IsAuthenticated])
    def me(self, request):
        """
        GET  /api/users/me/     -> current user profile
        PATCH /api/users/me/    -> update allowed fields on yourself
        (Serializer guards admin-only fields via runtime read_only)
        """
        if request.method == 'GET':
            return Response(self.get_serializer(request.user).data)

        # Optional: block self-promotion to admin if an admin already exists
        if request.data.get('user_type') == 'admin' and User.objects.filter(user_type='admin', is_staff=True).exists():
            return Response({'detail': 'Admin already exists.'}, status=403)

        serializer = self.get_serializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()

        # Keep is_staff in sync with user_type (optional)
        new_type = serializer.validated_data.get('user_type', instance.user_type)
        if new_type == 'admin' and not instance.is_staff:
            instance.is_staff = True
            instance.save(update_fields=['is_staff'])
        elif new_type in ('reviewer', 'owner') and instance.is_staff:
            instance.is_staff = False
            instance.save(update_fields=['is_staff'])

        instance.refresh_from_db()
        return Response(self.get_serializer(instance).data)

    @action(detail=False, methods=['get'], url_path='has-admin', permission_classes=[AllowAny])
    def has_admin(self, request):
        exists = User.objects.filter(user_type='admin', is_staff=True).exists()
        return Response({'exists': exists})
