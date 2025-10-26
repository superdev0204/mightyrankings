from rest_framework import serializers
from .models import Review, ReviewFlag
from businesses.models import Business, Doctor
from django.contrib.contenttypes.models import ContentType

def _local_part(email_like: str | None) -> str:
    if not email_like:
        return ""
    try:
        return str(email_like).split("@", 1)[0]
    except Exception:
        return str(email_like)


class ReviewFlagSerializer(serializers.ModelSerializer):
    user_full_name = serializers.CharField(source='flagged_by.full_name', read_only=True)
    user_username  = serializers.CharField(source='flagged_by.username', read_only=True)
    user_email     = serializers.EmailField(source='flagged_by.email', read_only=True)
    reason         = serializers.CharField(source='note', read_only=True)

    # legacy fields (still useful elsewhere)
    flagged_by_email    = serializers.EmailField(source='flagged_by.email', read_only=True)
    flagged_by_username = serializers.CharField(source='flagged_by.username', read_only=True)

    class Meta:
        model = ReviewFlag
        fields = [
            'id', 'review',
            'user_full_name', 'user_username', 'user_email',
            'reason', 'note',
            'flagged_by', 'flagged_by_email', 'flagged_by_username',
            'created_at',
        ]
        read_only_fields = [
            'id', 'created_at',
            'user_full_name', 'user_username', 'user_email',
            'reason', 'note',
            'flagged_by_email', 'flagged_by_username',
        ]


class ReviewSerializer(serializers.ModelSerializer):
    # WRITE: any of these may be provided (exactly one expected)
    business_id = serializers.PrimaryKeyRelatedField(
        source='business',
        queryset=Business.objects.all(),
        required=False, allow_null=True
    )
    doctor_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)  # NEW

    # READ helpers
    business_name = serializers.CharField(source='business.name', read_only=True)

    # expose FK for client-side "canEdit" checks
    user_id = serializers.IntegerField(read_only=True)

    created_date = serializers.DateTimeField(source='created_at', read_only=True)
    updated_date = serializers.DateTimeField(source='updated_at', read_only=True)

    created_by = serializers.SerializerMethodField()
    created_by_username = serializers.SerializerMethodField()
    created_by_full_name = serializers.SerializerMethodField()
    created_by_display = serializers.SerializerMethodField()

    owner_reply = serializers.CharField(read_only=True)
    owner_replied_at = serializers.DateTimeField(read_only=True)

    flag_count = serializers.SerializerMethodField()

    # READ: expose polymorphic target for UI if needed
    target_kind = serializers.CharField(source='target_kind', read_only=True)
    target_id = serializers.IntegerField(source='target_id', read_only=True)

    class Meta:
        model = Review
        fields = [
            'id',
            # write options
            'business_id', 'doctor_id',
            # read
            'business_name',
            'user_id',
            'rating', 'title', 'content',
            'verified', 'helpful_count', 'status',
            'created_at', 'updated_at', 'created_date', 'updated_date',

            'created_by',
            'created_by_username',
            'created_by_full_name',
            'created_by_display',

            'owner_reply', 'owner_replied_at',

            'flag_count',
            'target_kind', 'target_id',
        ]
        read_only_fields = [
            'verified', 'helpful_count', 'created_at', 'updated_at',
            'user_id', 'owner_reply', 'owner_replied_at',
            'created_by', 'created_by_username', 'created_by_full_name', 'created_by_display',
            'flag_count', 'target_kind', 'target_id',
        ]

    # --- existing getters unchanged ---
    def get_created_by(self, obj):
        try:
            return getattr(obj.user, 'email', None)
        except Exception:
            return None

    def get_created_by_username(self, obj):
        try:
            return getattr(obj.user, 'username', None)
        except Exception:
            return None

    def get_created_by_full_name(self, obj):
        try:
            return getattr(obj.user, 'full_name', '') or ''
        except Exception:
            return ''

    def get_created_by_display(self, obj):
        full_name = self.get_created_by_full_name(obj)
        if full_name:
            return full_name
        username = self.get_created_by_username(obj)
        if username:
            return username
        email_like = self.get_created_by(obj)
        local = (str(email_like).split("@", 1)[0] if email_like else "")
        return local or "User"

    def get_flag_count(self, obj):
        try:
            return obj.flags.count()
        except Exception:
            return 0

    def validate(self, attrs):
        """
        Ensure exactly one target is provided on create/update:
        - business (legacy)
        - or doctor_id (polymorphic)
        """
        business = attrs.get('business')
        doctor_id = self.initial_data.get('doctor_id', None)

        if business and doctor_id:
            raise serializers.ValidationError("Provide either business_id or doctor_id, not both.")
        if not business and not doctor_id and self.instance is None:
            raise serializers.ValidationError("Provide business_id or doctor_id.")

        # If doctor_id is provided, stash it for create()
        if doctor_id:
            try:
                attrs['_doctor'] = Doctor.objects.get(pk=int(doctor_id))
            except (Doctor.DoesNotExist, ValueError, TypeError):
                raise serializers.ValidationError("doctor_id is invalid.")
        return attrs

    def create(self, validated_data):
        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated:
            validated_data['user'] = request.user

        # doctor path
        doc = validated_data.pop('_doctor', None)
        if doc:
            ct = ContentType.objects.get_for_model(Doctor)
            return Review.objects.create(
                content_type=ct, object_id=doc.id, target=doc,
                **validated_data
            )

        # business (legacy) path
        return super().create(validated_data)