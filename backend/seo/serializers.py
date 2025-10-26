from rest_framework import serializers
from .models import PageMeta

class PageMetaSerializer(serializers.ModelSerializer):
    business_id = serializers.PrimaryKeyRelatedField(
        source='business',
        queryset=PageMeta._meta.get_field('business').remote_field.model.objects.all(),
        allow_null=True,
        required=False
    )
    doctor_id = serializers.PrimaryKeyRelatedField(
        source='doctor',
        queryset=PageMeta._meta.get_field('doctor').remote_field.model.objects.all(),
        allow_null=True,
        required=False
    )

    class Meta:
        model = PageMeta
        fields = [
            'id', 'page_name', 'meta_type',
            'business_id', 'doctor_id',
            'title', 'description', 'keywords',
            'og_title', 'og_description', 'og_image',
            'canonical_url', 'robots', 'priority', 'changefreq',
            'is_active', 'auto_managed', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
