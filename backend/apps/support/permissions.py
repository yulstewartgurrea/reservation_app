"""Object-level permissions for support tickets."""

from rest_framework import permissions

from apps.accounts.models import User


class IsTicketParticipantOrAdmin(permissions.BasePermission):
    """A user may interact with a ticket if they're its submitter or an admin.

    We deliberately keep this narrow — the related shop's owner is NOT
    considered a participant (see `services._is_participant` for the same
    rationale). The queryset on the viewset filters non-participant tickets
    out entirely so a non-participant gets 404, not 403; this class is the
    last-line check on detail actions for the (rare) admin paths.
    """

    message = "You do not have permission to interact with this ticket."

    def has_permission(self, request, view):
        # All viewset entry points require auth.
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        is_admin = user.role == User.Role.ADMIN or user.is_superuser
        return is_admin or obj.submitter_id == user.id
