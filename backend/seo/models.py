from django.db import models
from django.db.models import Q
from django.core.exceptions import ValidationError
from django.utils.timezone import now

from businesses.models import Business, Doctor


class PageMeta(models.Model):
    META_TYPE_CHOICES = [
        ('static', 'Static'),
        ('business', 'Business'),
        ('doctor', 'Doctor'),
    ]
    CHANGEFREQ_CHOICES = [
        ('always', 'Always'),
        ('hourly', 'Hourly'),
        ('daily', 'Daily'),
        ('weekly', 'Weekly'),
        ('monthly', 'Monthly'),
        ('yearly', 'Yearly'),
        ('never', 'Never'),
    ]

    # e.g. "home", "search", "business", "doctor"
    page_name = models.CharField(max_length=64)

    meta_type = models.CharField(max_length=10, choices=META_TYPE_CHOICES, default='static')

    # At most one of these will be set, depending on meta_type
    business = models.ForeignKey(
        Business, null=True, blank=True, on_delete=models.CASCADE, related_name='page_meta'
    )
    doctor = models.ForeignKey(
        Doctor, null=True, blank=True, on_delete=models.CASCADE, related_name='page_meta'
    )

    # core SEO
    title = models.CharField(max_length=255, blank=True, default='')
    description = models.TextField(blank=True, default='')
    keywords = models.TextField(blank=True, default='')

    # Open Graph
    og_title = models.CharField(max_length=255, blank=True, default='')
    og_description = models.TextField(blank=True, default='')
    og_image = models.URLField(blank=True, null=True)

    # advanced
    canonical_url = models.URLField(blank=True, null=True)
    robots = models.CharField(max_length=50, default='index, follow')
    priority = models.DecimalField(max_digits=3, decimal_places=2, default=0.50)  # 0.10–1.00
    changefreq = models.CharField(max_length=10, choices=CHANGEFREQ_CHOICES, default='monthly')
    is_active = models.BooleanField(default=True)

    # allow backend to keep this entry in sync automatically (unless admin freezes it)
    auto_managed = models.BooleanField(default=True)

    created_at = models.DateTimeField(default=now)
    updated_at = models.DateTimeField(default=now)

    class Meta:
        # Replace deprecated unique_together with explicit UniqueConstraints,
        # using partials to keep each meta target unique.
        constraints = [
            # Only one static record per page_name
            models.UniqueConstraint(
                fields=['page_name'],
                condition=Q(meta_type='static'),
                name='uniq_static_page_name'
            ),
            # Only one business meta per (page_name, business)
            models.UniqueConstraint(
                fields=['page_name', 'business'],
                condition=Q(meta_type='business'),
                name='uniq_business_page_meta'
            ),
            # Only one doctor meta per (page_name, doctor)
            models.UniqueConstraint(
                fields=['page_name', 'doctor'],
                condition=Q(meta_type='doctor'),
                name='uniq_doctor_page_meta'
            ),
        ]
        indexes = [
            models.Index(fields=['page_name']),
            models.Index(fields=['meta_type']),
            models.Index(fields=['is_active']),
            models.Index(fields=['-updated_at']),
            models.Index(fields=['business']),
            models.Index(fields=['doctor']),
            # partials to speed meta_type-specific filters
            models.Index(fields=['page_name'], name='pm_static_pagename_idx', condition=Q(meta_type='static')),
            models.Index(fields=['business'], name='pm_business_id_idx', condition=Q(meta_type='business')),
            models.Index(fields=['doctor'], name='pm_doctor_id_idx', condition=Q(meta_type='doctor')),
        ]
        ordering = ('-updated_at', 'id')

    def clean(self):
        """
        Enforce consistency:
          static  -> neither business nor doctor set
          business-> business set, doctor empty
          doctor  -> doctor set, business empty
        """
        if self.meta_type == 'static':
            if self.business_id or self.doctor_id:
                raise ValidationError("static meta_type must not reference business or doctor.")

        elif self.meta_type == 'business':
            if not self.business_id:
                raise ValidationError("business meta_type requires a business.")
            if self.doctor_id:
                raise ValidationError("business meta_type must not reference a doctor.")

        elif self.meta_type == 'doctor':
            if not self.doctor_id:
                raise ValidationError("doctor meta_type requires a doctor.")
            if self.business_id:
                raise ValidationError("doctor meta_type must not reference a business.")

    def __str__(self):
        if self.meta_type == 'business' and self.business_id:
            return f"{self.page_name} (business: {self.business_id})"
        if self.meta_type == 'doctor' and self.doctor_id:
            return f"{self.page_name} (doctor: {self.doctor_id})"
        return f"{self.page_name} ({self.meta_type})"
