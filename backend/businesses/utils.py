from typing import Iterable, Optional
from django.db.models import Count
from categories.models import Category
from .models import Business

# Count only ACTIVE businesses in the totals
COUNT_ACTIVE_ONLY = True

def recalc_category_counts(category_ids: Optional[Iterable[int]] = None) -> None:
    """
    Recompute Category.business_count from Business rows.
    If category_ids is provided, limit to those categories; otherwise update all.
    """
    qs = Business.objects.all()
    if COUNT_ACTIVE_ONLY:
        qs = qs.filter(status="active")

    if category_ids:
        ids = {int(cid) for cid in category_ids if cid}
        if not ids:
            return
        qs = qs.filter(category_id__in=ids)
        categories = Category.objects.filter(id__in=ids)
    else:
        categories = Category.objects.all()

    counts = {row["category_id"]: row["c"] for row in qs.values("category_id").annotate(c=Count("id"))}

    to_update = []
    for cat in categories:
        new_val = int(counts.get(cat.id, 0))
        if cat.business_count != new_val:
            cat.business_count = new_val
            to_update.append(cat)

    if to_update:
        Category.objects.bulk_update(to_update, ["business_count"], batch_size=1000)
