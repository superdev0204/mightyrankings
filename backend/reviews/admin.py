from django.contrib import admin
from .models import Review

@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ('business', 'title', 'rating', 'verified', 'status')
    search_fields = ('title', 'content')
    list_filter = ('rating', 'verified', 'status')