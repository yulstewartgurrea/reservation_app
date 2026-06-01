"""HTTP layer for the support ticketing module.

Thin views: validate input via serializers, call services for any write, and
return read-shape via the dedicated read serializer. Querysets are scoped in
`get_queryset` so non-admin users get a hard 404 on someone else's ticket —
no 403 vs 404 disclosure side-channel.
"""

from __future__ import annotations

import logging

from django.db.models import Q
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from apps.accounts.models import User
from apps.accounts.permissions import IsAdmin

from .models import Ticket, TicketMessage
from .permissions import IsTicketParticipantOrAdmin
from .serializers import (
    TicketCreateSerializer,
    TicketDetailSerializer,
    TicketListSerializer,
    TicketMessageSerializer,
)
from .services import (
    add_message,
    assign_ticket,
    change_priority,
    create_ticket,
    transition_status,
)

logger = logging.getLogger("apps.support")

# Attachment validation knobs — server-side enforcement so a malicious
# client can't just lie about Content-Length or pick a forbidden MIME.
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB
MAX_FILES_PER_MESSAGE = 5
ALLOWED_MIME = {
    "image/png",
    "image/jpeg",
    "image/webp",
    "application/pdf",
}


class _DynamicScopedUserThrottle(UserRateThrottle):
    """UserRateThrottle that re-reads its rate from settings each request.

    Stock `SimpleRateThrottle` snapshots `THROTTLE_RATES` at module import
    time, which breaks `override_settings` in tests and makes runtime tuning
    of throttle rates impossible. We override `get_rate` to read live from
    `api_settings.DEFAULT_THROTTLE_RATES` so the value can change between
    requests (and tests).
    """

    def get_rate(self):
        from rest_framework.settings import api_settings

        rates = api_settings.DEFAULT_THROTTLE_RATES or {}
        return rates.get(self.scope)


class _TicketCreateThrottle(_DynamicScopedUserThrottle):
    scope = "support_ticket_create"


class _TicketMessageThrottle(_DynamicScopedUserThrottle):
    scope = "support_message_create"


def _is_admin(user) -> bool:
    if not user or not getattr(user, "is_authenticated", False):
        return False
    return user.role == User.Role.ADMIN or user.is_superuser


def _validate_attachments(files):
    """Ensure 0..N files all pass size + MIME limits.

    Returns the list on success; raises a DRF-friendly ValidationError on
    failure so the view's normal exception handling produces a clean 400.
    """
    from rest_framework.exceptions import ValidationError as DRFValidationError

    if not files:
        return []
    if len(files) > MAX_FILES_PER_MESSAGE:
        raise DRFValidationError(
            {"attachments": f"At most {MAX_FILES_PER_MESSAGE} files per message."}
        )
    for f in files:
        size = getattr(f, "size", 0) or 0
        if size > MAX_FILE_SIZE:
            raise DRFValidationError(
                {"attachments": f"{getattr(f, 'name', 'file')} exceeds 5MB."}
            )
        mime = (getattr(f, "content_type", "") or "").lower()
        if mime not in ALLOWED_MIME:
            raise DRFValidationError(
                {"attachments": f"Unsupported file type: {mime or 'unknown'}."}
            )
    return files


class TicketViewSet(viewsets.ModelViewSet):
    """CRUD + custom actions for support tickets."""

    permission_classes = [permissions.IsAuthenticated, IsTicketParticipantOrAdmin]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_serializer_class(self):
        if self.action in ("list",):
            return TicketListSerializer
        if self.action == "create":
            return TicketCreateSerializer
        return TicketDetailSerializer

    def get_throttles(self):
        if self.action == "create":
            return [_TicketCreateThrottle()]
        if self.action in ("messages", "post_message"):
            return [_TicketMessageThrottle()]
        return super().get_throttles()

    def get_queryset(self):
        """Scope tickets by role.

        Non-admins see only their OWN tickets. This means a non-participant
        gets a 404 (queryset miss) rather than a 403 — no information leak
        about whether a ticket ID exists.
        """
        user = self.request.user
        qs = Ticket.objects.select_related(
            "submitter", "assigned_to", "related_shop", "related_reservation"
        )
        if not _is_admin(user):
            qs = qs.filter(submitter=user)
            return qs

        # Admin-only list filters. Whitelisted explicitly to avoid leaking
        # arbitrary ORM filters via the query string.
        params = self.request.query_params
        status_filter = params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        category = params.get("category")
        if category:
            qs = qs.filter(category=category)
        priority = params.get("priority")
        if priority:
            qs = qs.filter(priority=priority)
        assigned_to = params.get("assigned_to")
        if assigned_to == "me":
            qs = qs.filter(assigned_to=user)
        elif assigned_to == "unassigned":
            qs = qs.filter(assigned_to__isnull=True)
        elif assigned_to:
            qs = qs.filter(assigned_to_id=assigned_to)
        q = params.get("q")
        if q:
            qs = qs.filter(
                Q(subject__icontains=q)
                | Q(body__icontains=q)
                | Q(submitter__email__icontains=q)
            )
        return qs

    # ---- create ----------------------------------------------------------

    def create(self, request, *args, **kwargs):
        serializer = TicketCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ticket = create_ticket(submitter=request.user, **serializer.validated_data)
        return Response(
            TicketDetailSerializer(
                ticket,
                context=self._detail_context(ticket, request.user),
            ).data,
            status=status.HTTP_201_CREATED,
        )

    # ---- retrieve --------------------------------------------------------

    def retrieve(self, request, *args, **kwargs):
        ticket = self.get_object()
        return Response(
            TicketDetailSerializer(
                ticket, context=self._detail_context(ticket, request.user)
            ).data
        )

    # ---- patch -----------------------------------------------------------

    def partial_update(self, request, *args, **kwargs):
        """Limited updates.

        * Submitter (while ticket is OPEN) may edit subject/body.
        * Admin may update priority, assignment, status — but those are
          routed through their dedicated service functions so the audit
          trail stays correct.
        """
        ticket = self.get_object()
        user = request.user
        is_admin = _is_admin(user)
        data = request.data

        if is_admin:
            # Admin convenience: PATCH can change priority/status/assignee.
            # We still call the services so events are written.
            if "priority" in data:
                change_priority(
                    ticket=ticket, new_priority=data["priority"], actor=user
                )
            if "status" in data:
                transition_status(
                    ticket=ticket, new_status=data["status"], actor=user
                )
            if "assigned_to" in data:
                assignee_id = data["assigned_to"]
                assignee = None
                if assignee_id:
                    try:
                        assignee = User.objects.get(pk=assignee_id)
                    except User.DoesNotExist:
                        return Response(
                            {"assigned_to": "User not found."},
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                assign_ticket(ticket=ticket, assignee=assignee, actor=user)
            # Admins are allowed to edit subject/body too (rare, but useful
            # for cleaning up an inappropriate one) — fall through to the
            # generic field edit below.

        # Submitter can edit subject/body only while ticket is still OPEN.
        editable_by_submitter = (
            ticket.submitter_id == user.id
            and ticket.status == Ticket.Status.OPEN
        )
        if editable_by_submitter or is_admin:
            changed = False
            if "subject" in data:
                new_subject = (data.get("subject") or "").strip()
                if not new_subject:
                    return Response(
                        {"subject": "Subject cannot be blank."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                ticket.subject = new_subject
                changed = True
            if "body" in data:
                new_body = (data.get("body") or "").strip()
                if not new_body:
                    return Response(
                        {"body": "Body cannot be blank."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                ticket.body = new_body
                changed = True
            if changed:
                ticket.save(update_fields=["subject", "body", "updated_at"])

        ticket.refresh_from_db()
        return Response(
            TicketDetailSerializer(
                ticket, context=self._detail_context(ticket, user)
            ).data
        )

    # ---- messages --------------------------------------------------------

    @action(detail=True, methods=["get", "post"], url_path="messages")
    def messages(self, request, pk=None):
        ticket = self.get_object()
        user = request.user
        is_admin = _is_admin(user)

        if request.method == "GET":
            qs = ticket.messages.select_related("author").prefetch_related(
                "attachments"
            )
            if not is_admin:
                qs = qs.filter(is_internal=False)
            return Response(
                TicketMessageSerializer(qs, many=True).data
            )

        # POST: reply
        body = (request.data.get("body") or "").strip()
        if not body:
            return Response(
                {"body": "Message body is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # `attachments` is a multi-value field on multipart forms.
        files = []
        if hasattr(request.data, "getlist"):
            files = request.data.getlist("attachments")
        _validate_attachments(files)

        is_internal_flag = bool(request.data.get("is_internal"))
        # Defense-in-depth: the service forces this to False for non-admins
        # too, but rejecting at the edge gives a clearer 400 to clients.
        if is_internal_flag and not is_admin:
            return Response(
                {"is_internal": "Only admins can post internal notes."},
                status=status.HTTP_403_FORBIDDEN,
            )

        message = add_message(
            ticket=ticket,
            author=user,
            body=body,
            is_internal=is_internal_flag,
            attachment_files=files,
        )
        # Refresh to include attachments via prefetch in response.
        message = TicketMessage.objects.select_related("author").prefetch_related(
            "attachments"
        ).get(pk=message.pk)
        return Response(
            TicketMessageSerializer(message).data,
            status=status.HTTP_201_CREATED,
        )

    # ---- admin-only actions ---------------------------------------------

    @action(
        detail=True,
        methods=["post"],
        url_path="transition",
        permission_classes=[permissions.IsAuthenticated, IsAdmin],
    )
    def transition(self, request, pk=None):
        # Re-fetch via the un-scoped queryset (admins see everything anyway).
        ticket = self.get_object()
        new_status = request.data.get("new_status")
        if not new_status:
            return Response(
                {"new_status": "Required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        ticket = transition_status(
            ticket=ticket, new_status=new_status, actor=request.user
        )
        return Response(
            TicketDetailSerializer(
                ticket, context=self._detail_context(ticket, request.user)
            ).data
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="assign",
        permission_classes=[permissions.IsAuthenticated, IsAdmin],
    )
    def assign(self, request, pk=None):
        ticket = self.get_object()
        assignee_id = request.data.get("assignee_id")
        assignee = None
        if assignee_id is not None:
            try:
                assignee = User.objects.get(pk=assignee_id)
            except User.DoesNotExist:
                return Response(
                    {"assignee_id": "User not found."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        ticket = assign_ticket(
            ticket=ticket, assignee=assignee, actor=request.user
        )
        return Response(
            TicketDetailSerializer(
                ticket, context=self._detail_context(ticket, request.user)
            ).data
        )

    # ---- helpers ---------------------------------------------------------

    def _detail_context(self, ticket: Ticket, user) -> dict:
        """Build the context dict for `TicketDetailSerializer`.

        * Non-admin users get messages filtered to public-only and no events.
        * Admins get everything, with prefetch to keep N+1 in check.
        """
        is_admin = _is_admin(user)
        messages = ticket.messages.select_related("author").prefetch_related(
            "attachments"
        )
        if not is_admin:
            messages = messages.filter(is_internal=False)
        ctx: dict = {"messages": list(messages)}
        if is_admin:
            ctx["events"] = list(
                ticket.events.select_related("actor")
            )
        return ctx
