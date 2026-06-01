from django.contrib import admin

from .models import Ticket, TicketAttachment, TicketEvent, TicketMessage


class TicketMessageInline(admin.TabularInline):
    model = TicketMessage
    extra = 0
    fields = ("author", "body", "is_internal", "created_at")
    readonly_fields = ("created_at",)


class TicketEventInline(admin.TabularInline):
    model = TicketEvent
    extra = 0
    fields = ("event_type", "actor", "payload", "created_at")
    readonly_fields = fields
    can_delete = False

    def has_add_permission(self, request, obj=None):
        # Events are always written by the service layer — never by hand.
        return False


@admin.register(Ticket)
class TicketAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "subject",
        "submitter",
        "status",
        "priority",
        "assigned_to",
        "last_message_at",
    )
    list_filter = ("status", "priority", "category", "assigned_to")
    search_fields = ("subject", "body", "submitter__email")
    readonly_fields = (
        "created_at",
        "updated_at",
        "last_message_at",
        "resolved_at",
    )
    inlines = [TicketMessageInline, TicketEventInline]


@admin.register(TicketMessage)
class TicketMessageAdmin(admin.ModelAdmin):
    list_display = ("id", "ticket", "author", "is_internal", "created_at")
    list_filter = ("is_internal",)
    search_fields = ("body", "author__email", "ticket__subject")
    readonly_fields = ("created_at",)


@admin.register(TicketAttachment)
class TicketAttachmentAdmin(admin.ModelAdmin):
    list_display = ("id", "message", "original_name", "size", "uploaded_at")
    search_fields = ("original_name",)
    readonly_fields = ("uploaded_at",)


@admin.register(TicketEvent)
class TicketEventAdmin(admin.ModelAdmin):
    list_display = ("id", "ticket", "event_type", "actor", "created_at")
    list_filter = ("event_type",)
    search_fields = ("ticket__subject", "actor__email")
    readonly_fields = ("created_at",)
