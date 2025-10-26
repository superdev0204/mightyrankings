from django.db import models
from django.conf import settings
from businesses.models import Business
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils.timezone import now

from businesses.models import Business, Doctor  # NEW (import Doctor)
from django.contrib.contenttypes.models import ContentType              # NEW
from django.contrib.contenttypes.fields import GenericForeignKey

class Review(models.Model):
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('pending', 'Pending'),
        ('flagged', 'Flagged'),
        ('removed', 'Removed'),
    ]

    # LEGACY FK (keep for back-compat; make optional)
    business = models.ForeignKey(
        Business, on_delete=models.CASCADE, related_name='reviews',
        null=True, blank=True
    )

    # NEW: generic target (Business or Doctor)
    content_type = models.ForeignKey(ContentType, null=True, blank=True, on_delete=models.SET_NULL)
    object_id = models.PositiveIntegerField(null=True, blank=True)
    target = GenericForeignKey('content_type', 'object_id')

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='reviews')

    rating = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)])
    title = models.CharField(max_length=255)
    content = models.TextField()
    verified = models.BooleanField(default=False)
    helpful_count = models.IntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(default=now)
    updated_at = models.DateTimeField(default=now)

    owner_reply = models.TextField(blank=True, null=True)
    owner_replied_at = models.DateTimeField(blank=True, null=True)
    owner_replied_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='review_replies'
    )

    class Meta:
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["-created_at"]),
            models.Index(fields=["business"]),
            models.Index(fields=["user"]),
            # helpful for doctor/generic lookups:
            models.Index(fields=["content_type", "object_id"]),
        ]

    def __str__(self):
        return f"{self.title} - {self.rating}★"

    # Convenience for responses
    @property
    def target_kind(self):
        if self.business_id:
            return "business"
        if not self.content_type_id:
            return None
        model = self.content_type.model
        if model == 'business':
            return 'business'
        if model == 'doctor':
            return 'doctor'
        return model

    @property
    def target_id(self):
        return self.business_id or self.object_id


class ReviewFlag(models.Model):
    review = models.ForeignKey(Review, on_delete=models.CASCADE, related_name='flags')
    flagged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='review_flags'
    )
    note = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(default=now)

    class Meta:
        indexes = [
            models.Index(fields=["review"]),
            models.Index(fields=["-created_at"]),
        ]

    def __str__(self):
        who = getattr(self.flagged_by, "username", None) or "anon"
        return f"Flag(review={self.review_id}, by={who})"