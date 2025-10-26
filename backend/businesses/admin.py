from django.contrib import admin
from .models import Business

@admin.register(Business)
class BusinessAdmin(admin.ModelAdmin):
    list_display = ('name', 'category', 'claimed_by', 'is_premium', 'status')
    search_fields = ('name', 'location')
    list_filter = ('is_premium', 'status', 'category')
