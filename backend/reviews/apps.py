from django.apps import AppConfig

class ReviewsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "reviews"

    def ready(self):
        # Ensure signal handlers are registered
        import reviews.signals  # noqa: F401