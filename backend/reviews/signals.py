from django.db.models.signals import post_save, post_delete, pre_save
from django.dispatch import receiver
from django.db.models import Avg, Count

from .models import Review
from businesses.models import Business


def _update_business_review_stats(business_id: int | None):
    if not business_id:
        return
    agg = (
        Review.objects
        .filter(business_id=business_id, status='active')
        .aggregate(avg=Avg('rating'), cnt=Count('id'))
    )
    avg = agg['avg'] or 0.0
    cnt = agg['cnt'] or 0
    # Store a simple float; the UI can format (e.g., to 1 decimal).
    Business.objects.filter(id=business_id).update(
        average_rating=float(avg),
        total_reviews=int(cnt),
    )


@receiver(pre_save, sender=Review)
def review_pre_save(sender, instance: Review, **kwargs):
    """
    Capture the previous business_id in case the review is moved
    between businesses; we’ll recompute both old and new.
    """
    if instance.pk:
        try:
            old = Review.objects.get(pk=instance.pk)
            instance._old_business_id = old.business_id
        except Review.DoesNotExist:
            instance._old_business_id = None


@receiver(post_save, sender=Review)
def review_post_save(sender, instance: Review, created, **kwargs):
    # If the business changed, recompute the old one too.
    old_bid = getattr(instance, "_old_business_id", None)
    if old_bid and old_bid != instance.business_id:
        _update_business_review_stats(old_bid)

    _update_business_review_stats(instance.business_id)


@receiver(post_delete, sender=Review)
def review_post_delete(sender, instance: Review, **kwargs):
    _update_business_review_stats(instance.business_id)