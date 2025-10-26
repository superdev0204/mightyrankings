from django.db import models
from django.db.models import Q
from django.conf import settings
from categories.models import Category
from django.utils.text import slugify


class Business(models.Model):
    STATUS_CHOICES = [
        ("active", "Active"),
        ("pending", "Pending"),
        ("suspended", "Suspended"),
    ]

    # Core identity (Lawyer vertical)
    name = models.CharField(max_length=255)
    license = models.TextField(blank=True, null=True)

    # NEW: public contact email for the business
    email = models.EmailField(blank=True, null=True)

    # Address
    street_address = models.CharField(max_length=255, blank=True, null=True)
    city = models.CharField(max_length=255, blank=True, null=True)
    state = models.CharField(max_length=64, blank=True, null=True)
    zip = models.CharField(max_length=32, blank=True, null=True)

    # Profile
    description = models.TextField(blank=True, null=True)
    practice_areas = models.TextField(blank=True, null=True)
    honors = models.TextField(blank=True, null=True)
    work_experience = models.TextField(blank=True, null=True)
    associations = models.TextField(blank=True, null=True)
    education = models.TextField(blank=True, null=True)
    speaking_engagements = models.TextField(blank=True, null=True)
    publications = models.TextField(blank=True, null=True)
    language = models.TextField(blank=True, null=True)

    # Contact
    website = models.URLField(blank=True, null=True)
    phone = models.CharField(max_length=32, blank=True, null=True)
    image_url = models.URLField(blank=True, null=True)

    # Category & ownership
    category = models.ForeignKey(
        Category, on_delete=models.SET_NULL, null=True, related_name="businesses"
    )

    # NEW: “works with/for” — simple external URL (not a relation)
    works_for = models.URLField(
        blank=True,
        null=True,
        help_text="Optional external website this business works with/for.",
    )

    claimed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="claimed_businesses",
    )
    claimed_at = models.DateTimeField(blank=True, null=True)

    pending_claim_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pending_claim_businesses",
    )
    pending_claim_notes = models.TextField(blank=True, null=True)
    pending_claim_requested_at = models.DateTimeField(blank=True, null=True)

    # Monetization / ratings / status
    is_premium = models.BooleanField(default=False)
    premium_expires = models.DateField(blank=True, null=True)
    average_rating = models.FloatField(default=0)
    total_reviews = models.IntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")

    # Slug & timestamps
    slug = models.SlugField(max_length=255, unique=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["is_premium"]),
            models.Index(fields=["average_rating"]),
            models.Index(fields=["slug"]),
            models.Index(fields=["claimed_by"]),
            models.Index(fields=["pending_claim_by"]),
            models.Index(fields=["city"]),
            models.Index(fields=["state"]),
            models.Index(fields=["status", "average_rating"], name="biz_status_avg"),
            models.Index(fields=["is_premium", "average_rating"], name="biz_premium_avg"),
            models.Index(fields=["-updated_at"]),
        ]
        constraints = [
            models.CheckConstraint(
                check=Q(average_rating__gte=0.0) & Q(average_rating__lte=5.0),
                name="biz_avg_rating_0_5",
            ),
        ]
        ordering = ("-updated_at", "id")

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug and self.name:
            base = slugify(self.name) or "business"
            candidate = base
            n = 1
            Model = self.__class__
            while Model.objects.filter(slug=candidate).exclude(pk=self.pk).exists():
                candidate = f"{base}-{n}"
                n += 1
            self.slug = candidate
        super().save(*args, **kwargs)


class Doctor(models.Model):
    """
    Doctors (medical providers)
    """
    STATUS_CHOICES = [
        ("active", "Active"),
        ("pending", "Pending"),
        ("suspended", "Suspended"),
    ]

    # Identity
    provider_name = models.CharField(max_length=255)
    specialty = models.CharField(max_length=255, blank=True, null=True)

    # NEW: public contact email for the provider
    email = models.EmailField(blank=True, null=True)

    # Profile
    description = models.TextField(blank=True, null=True)
    insurances = models.TextField(blank=True, null=True)
    popular_visit_reasons = models.TextField(blank=True, null=True)

    # Address
    street_address = models.CharField(max_length=255, blank=True, null=True)
    city = models.CharField(max_length=255, blank=True, null=True)
    state = models.CharField(max_length=64, blank=True, null=True)
    zip = models.CharField(max_length=32, blank=True, null=True)

    # Practice & education
    practice_names = models.TextField(blank=True, null=True)
    educations = models.TextField(blank=True, null=True)

    # Misc
    languages = models.TextField(blank=True, null=True)
    gender = models.CharField(max_length=32, blank=True, null=True)
    npi_number = models.CharField(max_length=32, blank=True, null=True)

    # Contact
    website = models.URLField(blank=True, null=True)
    phone = models.CharField(max_length=32, blank=True, null=True)
    image_url = models.URLField(blank=True, null=True)

    # Category & ownership
    category = models.ForeignKey(
        Category, on_delete=models.SET_NULL, null=True, related_name="doctors"
    )

    # NEW: Doctor works with/for — simple external URL (not a relation)
    works_for = models.URLField(
        blank=True,
        null=True,
        help_text="Optional external website this provider works with/for.",
    )

    claimed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="claimed_doctors",
    )
    claimed_at = models.DateTimeField(blank=True, null=True)

    pending_claim_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pending_claim_doctors",
    )
    pending_claim_notes = models.TextField(blank=True, null=True)
    pending_claim_requested_at = models.DateTimeField(blank=True, null=True)

    # Monetization / ratings / status
    is_premium = models.BooleanField(default=False)
    premium_expires = models.DateField(blank=True, null=True)
    average_rating = models.FloatField(default=0)
    total_reviews = models.IntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")

    # Slug & timestamps
    slug = models.SlugField(max_length=255, unique=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)  # fix
    updated_at = models.DateTimeField(auto_now=True)      # fix

    class Meta:
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["is_premium"]),
            models.Index(fields=["average_rating"]),
            models.Index(fields=["slug"]),
            models.Index(fields=["claimed_by"]),
            models.Index(fields=["pending_claim_by"]),
            models.Index(fields=["city"]),
            models.Index(fields=["state"]),
            models.Index(fields=["status", "average_rating"], name="doc_status_avg"),
            models.Index(fields=["is_premium", "average_rating"], name="doc_premium_avg"),
            models.Index(fields=["-updated_at"]),
        ]
        constraints = [
            models.CheckConstraint(
                check=Q(average_rating__gte=0.0) & Q(average_rating__lte=5.0),
                name="doc_avg_rating_0_5",
            ),
        ]
        ordering = ("-updated_at", "id")

    def __str__(self):
        return self.provider_name

    def save(self, *args, **kwargs):
        if not self.slug and self.provider_name:
            base = slugify(self.provider_name) or "doctor"
            candidate = base
            n = 1
            Model = self.__class__
            while Model.objects.filter(slug=candidate).exclude(pk=self.pk).exists():
                candidate = f"{base}-{n}"
                n += 1
            self.slug = candidate
        super().save(*args, **kwargs)
