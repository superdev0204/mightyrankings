from django.apps import AppConfig

class BusinessesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "businesses"

    def ready(self):
        # registers signal handlers
        from . import signals  # noqa