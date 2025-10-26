from django.contrib import admin
from .models import User

@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('email', 'full_name', 'role', 'user_type', 'status', 'verified', 'premium_membership')
    search_fields = ('email', 'full_name')
    list_filter = ('role', 'user_type', 'status', 'verified')