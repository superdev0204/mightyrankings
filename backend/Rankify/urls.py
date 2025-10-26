from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.csrf import ensure_csrf_cookie

# ✅ import the module, then use seo_views.<func>
from seo import views as seo_views

@ensure_csrf_cookie
def csrf_seed(request):
    return JsonResponse({"csrftoken": get_token(request)}, status=200)

urlpatterns = [
    path("admin/", admin.site.urls),

    # Auth
    path("accounts/", include("allauth.urls")),
    path("api/auth/csrf/", csrf_seed),

    # API apps
    path("api/users/", include("users.urls")),
    path("api/", include(("businesses.urls", "businesses"), namespace="businesses")),
    path("api/reviews/", include("reviews.urls")),
    path("api/categories/", include("categories.urls")),
    path("api/seo/", include("seo.urls")),

    # If you actually have a billing app; otherwise remove this line
    path("api/billing/", include("billing.urls")),

    # Sitemaps (make sure these are not shadowed by catch-alls)
    path("sitemap.xml", seo_views.sitemap_index, name="sitemap-index"),
    path("sitemaps/static.xml", seo_views.sitemap_static, name="sitemap-static"),
    path("sitemaps/categories.xml", seo_views.sitemap_categories, name="sitemap-categories"),
    path("sitemaps/businesses-<int:chunk>.xml", seo_views.sitemap_businesses_chunk, name="sitemap-businesses-chunk"),
    path("sitemaps/doctors-<int:chunk>.xml", seo_views.sitemap_doctors_chunk, name="sitemap-doctors-chunk"),
]
