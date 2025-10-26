# seo/utils.py
from django.db import IntegrityError, transaction
from django.utils.timezone import now

from .models import PageMeta

BUSINESS_PAGE_NAME = "business"

def _seo_title_for_business(biz):
    """
    Requirement:
      SEO Title -> "<Name>, a lawyer in <City, State>"
      (Falls back gracefully if city/state are missing)
    """
    name = (biz.name or "").strip() or "Business"
    city = (biz.city or "").strip()
    state = (biz.state or "").strip()

    loc = ""
    if city and state:
        loc = f"{city}, {state}"
    elif city:
        loc = city
    elif state:
        loc = state

    if loc:
        return f"{name}, a lawyer in {loc}"
    return f"{name}, a lawyer"

def _seo_keywords_for_business(biz):
    """
    Requirement:
      Keywords -> "name, lawyer in <city, state>, lawyer reviews in <city, state>"
    (Lowercase the dynamic phrases a bit for consistency; keep name as-is.)
    """
    name = (biz.name or "").strip() or "business"
    city = (biz.city or "").strip()
    state = (biz.state or "").strip()

    loc = ""
    if city and state:
        loc = f"{city}, {state}".lower()
    elif city:
        loc = city.lower()
    elif state:
        loc = state.lower()

    if loc:
        return f"{name}, lawyer in {loc}, lawyer reviews in {loc}"
    # If no location, still put a generic phrase
    return f"{name}, lawyer, lawyer reviews"

def _seo_description_for_business(biz):
    """
    A safe, short default description. You can adjust as desired.
    """
    name = (biz.name or "").strip() or "This business"
    city = (biz.city or "").strip()
    state = (biz.state or "").strip()

    loc = ""
    if city and state:
        loc = f"{city}, {state}"
    elif city:
        loc = city
    elif state:
        loc = state

    if loc:
        return f"Learn about {name}, a lawyer in {loc}. Reviews, details and contact info."
    return f"Learn about {name}. Reviews, details and contact info."

def _og_title_for_business(biz):
    # Keep OG title close to page title
    return _seo_title_for_business(biz)

def _og_description_for_business(biz):
    # Same as description for now
    return _seo_description_for_business(biz)

def ensure_business_meta(biz, refresh=False):
    """
    Idempotently create/update the PageMeta for a Business.

    - Uses unique key (page_name='business', meta_type='business', business_id=biz.id)
    - Respects PageMeta.auto_managed:
        * If auto_managed == False, we do NOT overwrite content (unless you want to force).
        * If auto_managed == True, we fill/refresh fields.
    - refresh=True => always recompute defaults and update when auto_managed==True
    - refresh=False => only fill blanks when auto_managed==True

    Returns the PageMeta instance.
    """
    if not getattr(biz, "id", None):
        # No PK: cannot link. Caller should pass a saved instance.
        return None

    defaults = {
        "title": _seo_title_for_business(biz),
        "description": _seo_description_for_business(biz),
        "keywords": _seo_keywords_for_business(biz),
        "og_title": _og_title_for_business(biz),
        "og_description": _og_description_for_business(biz),
        "og_image": None,
        "canonical_url": None,
        "robots": "index, follow",
        "priority": 0.80,         # business pages slightly higher by default
        "changefreq": "weekly",
        "is_active": True,
        "auto_managed": True,
        "updated_at": now(),
    }

    # Try update_or_create with the unique natural key
    try:
        with transaction.atomic():
            pm, created = PageMeta.objects.update_or_create(
                page_name=BUSINESS_PAGE_NAME,
                meta_type="business",
                business=biz,
                defaults=defaults if refresh else {"updated_at": now()},
            )

        # If not created and not refresh, we may need to *fill blanks* (only when auto_managed is True)
        if not created:
            if not pm.auto_managed:
                # Admin has frozen this; don't touch content.
                return pm

            changed = False
            if refresh:
                # Overwrite with fresh defaults
                pm.title = defaults["title"]
                pm.description = defaults["description"]
                pm.keywords = defaults["keywords"]
                pm.og_title = defaults["og_title"]
                pm.og_description = defaults["og_description"]
                pm.changefreq = defaults["changefreq"]
                pm.priority = defaults["priority"]
                pm.robots = defaults["robots"]
                pm.is_active = True if pm.is_active is None else pm.is_active
                pm.updated_at = now()
                changed = True
            else:
                # Only fill missing/blank fields
                if not (pm.title or "").strip():
                    pm.title = defaults["title"]; changed = True
                if not (pm.description or "").strip():
                    pm.description = defaults["description"]; changed = True
                if not (pm.keywords or "").strip():
                    pm.keywords = defaults["keywords"]; changed = True
                if not (pm.og_title or "").strip():
                    pm.og_title = defaults["og_title"]; changed = True
                if not (pm.og_description or "").strip():
                    pm.og_description = defaults["og_description"]; changed = True
                if pm.priority is None:
                    pm.priority = defaults["priority"]; changed = True
                if not (pm.robots or "").strip():
                    pm.robots = defaults["robots"]; changed = True
                if not (pm.changefreq or "").strip():
                    pm.changefreq = defaults["changefreq"]; changed = True
                if pm.is_active is None:
                    pm.is_active = True; changed = True
                if changed:
                    pm.updated_at = now()
            if changed:
                pm.save(update_fields=[
                    "title","description","keywords",
                    "og_title","og_description","robots",
                    "priority","changefreq","is_active","updated_at"
                ])
        return pm

    except IntegrityError:
        # Race with another writer: fetch and update safely
        pm = PageMeta.objects.filter(
            page_name=BUSINESS_PAGE_NAME, meta_type="business", business=biz
        ).first()
        if not pm:
            return None

        if not pm.auto_managed:
            return pm

        # Same update policy as above
        if refresh:
            pm.title = defaults["title"]
            pm.description = defaults["description"]
            pm.keywords = defaults["keywords"]
            pm.og_title = defaults["og_title"]
            pm.og_description = defaults["og_description"]
            pm.priority = defaults["priority"]
            pm.changefreq = defaults["changefreq"]
            pm.robots = defaults["robots"]
            pm.is_active = True if pm.is_active is None else pm.is_active
            pm.updated_at = now()
            pm.save(update_fields=[
                "title","description","keywords",
                "og_title","og_description","robots",
                "priority","changefreq","is_active","updated_at"
            ])
        else:
            changed = False
            if not (pm.title or "").strip():
                pm.title = defaults["title"]; changed = True
            if not (pm.description or "").strip():
                pm.description = defaults["description"]; changed = True
            if not (pm.keywords or "").strip():
                pm.keywords = defaults["keywords"]; changed = True
            if not (pm.og_title or "").strip():
                pm.og_title = defaults["og_title"]; changed = True
            if not (pm.og_description or "").strip():
                pm.og_description = defaults["og_description"]; changed = True
            if pm.priority is None:
                pm.priority = defaults["priority"]; changed = True
            if not (pm.robots or "").strip():
                pm.robots = defaults["robots"]; changed = True
            if not (pm.changefreq or "").strip():
                pm.changefreq = defaults["changefreq"]; changed = True
            if pm.is_active is None:
                pm.is_active = True; changed = True
            if changed:
                pm.updated_at = now()
                pm.save(update_fields=[
                    "title","description","keywords",
                    "og_title","og_description","robots",
                    "priority","changefreq","is_active","updated_at"
                ])
        return pm
