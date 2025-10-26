# businesses/signals.py
from django.db.models.signals import pre_save, post_save, post_delete
from django.dispatch import receiver

from .models import Business
from .utils import recalc_category_counts

# ✅ SEO auto-generator
# - safe: wrapped in try/except so SEO hiccups never block writes
# - refreshes only if PageMeta.auto_managed == True
try:
    from seo.utils import ensure_business_meta  # make sure seo app is installed
except Exception:  # pragma: no cover
    ensure_business_meta = None


@receiver(pre_save, sender=Business)
def _business_pre_save(sender, instance: Business, **kwargs):
    # capture previous category/status so we can recalc both sides on change
    if instance.pk:
        try:
            old = sender.objects.get(pk=instance.pk)
            instance._old_category_id = old.category_id
            instance._old_status = old.status
        except sender.DoesNotExist:
            instance._old_category_id = None
            instance._old_status = None
    else:
        instance._old_category_id = None
        instance._old_status = None


@receiver(post_save, sender=Business)
def _business_post_save(sender, instance: Business, created: bool, **kwargs):
    # --- Category counts (existing behavior) ---
    category_ids = {instance.category_id, getattr(instance, "_old_category_id", None)}
    # If you count only ACTIVE, status flips also need a recalc
    if getattr(instance, "_old_status", None) != instance.status:
        category_ids.add(instance.category_id)
        category_ids.add(getattr(instance, "_old_category_id", None))
    recalc_category_counts(category_ids)

    # --- SEO meta: auto-create / refresh (new) ---
    # Safe: never blocks business saves if SEO has an issue
    if ensure_business_meta:
        try:
            # Will create if missing; refreshes only when auto_managed=True
            ensure_business_meta(instance, refresh=True)
        except Exception:
            # Intentionally swallow errors so writes are not affected
            pass


@receiver(post_delete, sender=Business)
def _business_post_delete(sender, instance: Business, **kwargs):
    # Removing a business reduces the count of its category
    recalc_category_counts([instance.category_id])
