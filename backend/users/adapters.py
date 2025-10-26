from allauth.account.adapter import DefaultAccountAdapter
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from django.contrib.auth import get_user_model
from django.conf import settings
from urllib.parse import urlparse
from rest_framework_simplejwt.tokens import AccessToken

User = get_user_model()

def _first_frontend():
    # pick the first allowed frontend origin
    try:
        fronts = getattr(settings, "FRONTEND_ORIGINS", [])
        if fronts:
            return fronts[0]
    except Exception:
        pass
    return "https://mightyrankings.com/"

def _is_allowed_frontend(url: str) -> bool:
    try:
        host = urlparse(url).scheme + "://" + urlparse(url).netloc
        return host in getattr(settings, "FRONTEND_ORIGINS", [])
    except Exception:
        return False

class AccountAdapter(DefaultAccountAdapter):
    """After login, redirect to SPA with an access_token in the URL."""
    def get_login_redirect_url(self, request):
        user = request.user
        base = request.GET.get("next") or request.session.get("next") or _first_frontend()
        if not _is_allowed_frontend(base):
            base = _first_frontend()
        token = str(AccessToken.for_user(user))
        join = "&" if "?" in base else "?"
        return f"{base}{join}access_token={token}"

class SocialAdapter(DefaultSocialAccountAdapter):
    """Force auto-signup and auto-link by email to avoid 3rdparty/signup."""
    def is_open_for_signup(self, request, sociallogin):
        # Always allow automatic signup (no extra form)
        return True

    def pre_social_login(self, request, sociallogin):
        # If a user with the same email exists, connect this social login to it.
        email = None
        if sociallogin.user and sociallogin.user.email:
            email = sociallogin.user.email
        else:
            email = (sociallogin.account.extra_data or {}).get("email")

        if not email:
            return  # nothing to do; allauth will handle (rare for Google)

        try:
            existing = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            return  # let allauth create a new one

        # If sociallogin not yet linked, link it to the existing user.
        if request.user.is_authenticated and request.user != existing:
            # user already logged in but email belongs to another account; let allauth handle
            return
        sociallogin.connect(request, existing)
