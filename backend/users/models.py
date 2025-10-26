from django.contrib.auth.models import AbstractUser
from django.db import models

class User(AbstractUser):
    ROLE_CHOICES = [
        ('admin', 'Admin'),
        ('user', 'User'),
    ]
    USER_TYPE_CHOICES = [
        ('reviewer', 'Reviewer'),
        ('owner', 'Owner'),
        ('admin', 'Admin'),
    ]
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('active', 'Active'),
        ('suspended', 'Suspended'),
    ]

    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='user')
    full_name = models.CharField(max_length=255, blank=True, default="")
    user_type = models.CharField(max_length=20, choices=USER_TYPE_CHOICES, default='reviewer')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    profile_image = models.URLField(blank=True, null=True)
    bio = models.TextField(blank=True, null=True)
    verified = models.BooleanField(default=False)
    total_reviews = models.IntegerField(default=0)
    premium_membership = models.BooleanField(default=False)
    premium_expires = models.DateField(blank=True, null=True)

    # ✅ Stripe integration fields (needed by webhook/sync code)
    stripe_customer_id = models.CharField(max_length=120, blank=True, null=True)
    stripe_subscription_id = models.CharField(max_length=120, blank=True, null=True)
    stripe_price_id = models.CharField(max_length=120, blank=True, null=True)

    class Meta:
        indexes = [
            models.Index(fields=["user_type"]),
            models.Index(fields=["status"]),
            models.Index(fields=["premium_membership"]),
        ]

    def __str__(self):
        return self.full_name or self.username or self.email or f"User {self.pk}"
