from django.db import models, transaction
from django.db.models import Q, F
from django.core.exceptions import ValidationError
import re


def make_category_slug(name: str) -> str:
    """
    Preserve case, replace any non-alphanumeric run with '_', trim edge underscores.
    Example: 'Beard Care' -> 'Beard_Care'
    """
    base = re.sub(r'[^A-Za-z0-9]+', '_', (name or '').strip()).strip('_')
    return base or 'Category'


class Category(models.Model):
    # Not globally unique; may repeat in different branches
    name = models.CharField(max_length=100)

    # Human-readable URL piece like 'Beard_Care'
    # Uniqueness is enforced per parent via unique_together
    slug = models.SlugField(max_length=120, blank=True)

    description = models.TextField(blank=True, null=True)
    icon = models.CharField(max_length=100, blank=True, null=True)
    color = models.CharField(max_length=50, blank=True, null=True)
    business_count = models.IntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)
    # Tree
    parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        related_name="children",
        on_delete=models.PROTECT,  # protect tree integrity
    )

    # Cached full path for fast lookup: 'Lawyers/Personal_Injury_Lawyers'
    full_slug = models.CharField(
        max_length=1024,
        unique=True,
        db_index=True,
        editable=False,
    )

    class Meta:
        unique_together = [("parent", "slug")]  # slug must be unique among siblings
        indexes = [
            models.Index(fields=["slug"]),
            models.Index(fields=["full_slug"]),
            models.Index(fields=["parent"]),
            models.Index(fields=["business_count"]),
        ]
        ordering = ["full_slug"]
        constraints = [
            # Prevent self-parenting at the DB level
            models.CheckConstraint(
                check=~Q(parent=F("id")),
                name="category_no_self_parent",
            ),
        ]

    def __str__(self):
        return self.full_slug or self.name

    # ---- helpers ----
    def _compute_full_slug(self) -> str:
        my_slug = self.slug or make_category_slug(self.name)
        return f"{self.parent.full_slug}/{my_slug}" if self.parent else my_slug

    def clean(self):
        """
        Application-level validation to prevent cycles and self-parent.
        """
        # Self-parent guard (duplicated by DB constraint for defense in depth)
        if self.parent_id and self.id and self.parent_id == self.id:
            raise ValidationError({"parent": "Category cannot be its own parent."})

        # Cycle guard: walk up bounded steps
        seen = set()
        cur = self.parent
        steps = 0
        while cur is not None and steps < 200:
            if self.id and cur.id == self.id:
                raise ValidationError({"parent": "Cycle detected in category tree."})
            if cur.id in seen:
                break
            seen.add(cur.id)
            cur = cur.parent
            steps += 1

    @transaction.atomic
    def save(self, *args, **kwargs):
        # Validate invariants (exclude computed field)
        self.full_clean(exclude=["full_slug"])

        # Remember old path so we can update descendants if it changes
        old_full = None
        if self.pk:
            try:
                old_full = Category.objects.only("full_slug").get(pk=self.pk).full_slug
            except Category.DoesNotExist:
                old_full = None

        # Ensure sibling-unique slug
        if not self.slug:
            base = make_category_slug(self.name)
            slug = base
            i = 2
            while Category.objects.filter(parent=self.parent, slug=slug).exclude(pk=self.pk).exists():
                slug = f"{base}_{i}"
                i += 1
            self.slug = slug

        # Compute/correct full_slug
        self.full_slug = self._compute_full_slug()

        super().save(*args, **kwargs)

        # If our path changed, update descendant paths efficiently
        if old_full and old_full != self.full_slug:
            self._update_descendant_paths(old_full_prefix=old_full)

    def _update_descendant_paths(self, old_full_prefix: str):
        """
        When this node's full_slug changes (rename or reparent), cascade the change
        into all descendants by swapping the prefix.
        """
        old_prefix = f"{old_full_prefix}/"
        new_prefix = f"{self.full_slug}/"

        descendants = Category.objects.filter(full_slug__startswith=old_prefix).only("id", "full_slug")
        to_update = []
        for c in descendants:
            remainder = c.full_slug[len(old_prefix):]
            new_full = f"{new_prefix}{remainder}"
            if c.full_slug != new_full:
                c.full_slug = new_full
                to_update.append(c)
        if to_update:
            Category.objects.bulk_update(to_update, ["full_slug"])
