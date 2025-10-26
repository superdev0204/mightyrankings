from django.contrib import admin
from .models import Category

@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'business_count')
    search_fields = ('name',)
    list_filter = ('color',)
