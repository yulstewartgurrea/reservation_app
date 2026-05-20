from collections import defaultdict
from decimal import Decimal

from django.db.models import Sum
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from rest_framework import status

from apps.accounts.permissions import IsAdmin
from apps.reservations.commission_billing import (
    generate_monthly_invoices,
    mark_invoice_paid,
    void_invoice,
)
from apps.reservations.models import CommissionInvoice, CommissionLedger, Reservation
from apps.reservations.serializers import CommissionInvoiceSerializer
from apps.shops.models import Shop
from apps.shops.serializers import ShopDetailSerializer


@api_view(["GET"])
@permission_classes([IsAdmin])
def overview(request):
    """High-level platform metrics for the admin dashboard."""
    return Response(
        {
            "shops": {
                "total": Shop.objects.count(),
                "active": Shop.objects.filter(status=Shop.Status.ACTIVE).count(),
                "pending": Shop.objects.filter(status=Shop.Status.PENDING).count(),
                "paused": Shop.objects.filter(status=Shop.Status.PAUSED).count(),
            },
            "reservations": {
                "total": Reservation.objects.count(),
                "completed": Reservation.objects.filter(
                    status=Reservation.Status.COMPLETED
                ).count(),
                "no_show": Reservation.objects.filter(status=Reservation.Status.NO_SHOW).count(),
            },
            "commission": {
                "total": float(
                    CommissionLedger.objects.aggregate(s=Sum("amount"))["s"] or Decimal("0")
                ),
                "settled": float(
                    CommissionLedger.objects.filter(settled_at__isnull=False).aggregate(
                        s=Sum("amount")
                    )["s"]
                    or Decimal("0")
                ),
                "outstanding": float(
                    CommissionLedger.objects.filter(settled_at__isnull=True).aggregate(
                        s=Sum("amount")
                    )["s"]
                    or Decimal("0")
                ),
            },
        }
    )


@api_view(["GET"])
@permission_classes([IsAdmin])
def pending_shops(request):
    qs = Shop.objects.filter(status=Shop.Status.PENDING).order_by("-created_at")
    return Response(ShopDetailSerializer(qs, many=True).data)


@api_view(["POST"])
@permission_classes([IsAdmin])
def approve_shop(request, shop_id: int):
    try:
        shop = Shop.objects.get(pk=shop_id)
    except Shop.DoesNotExist:
        return Response({"detail": "Not found."}, status=404)
    shop.status = Shop.Status.ACTIVE
    shop.save(update_fields=["status", "updated_at"])
    return Response(ShopDetailSerializer(shop).data)


@api_view(["GET"])
@permission_classes([IsAdmin])
def commission_ledger(request):
    period = request.query_params.get("period")
    qs = CommissionLedger.objects.select_related("shop")
    if period:
        qs = qs.filter(period=period)
    qs = qs.order_by("-created_at")[:500]

    by_shop: dict[int, dict] = defaultdict(
        lambda: {"shop_id": None, "shop_name": "", "total": Decimal("0"), "settled": Decimal("0")}
    )
    rows = []
    for entry in qs:
        rows.append(
            {
                "id": entry.id,
                "shop_id": entry.shop_id,
                "shop_name": entry.shop.name,
                "amount": float(entry.amount),
                "rate": float(entry.rate),
                "period": entry.period,
                "settled": entry.settled_at is not None,
                "created_at": entry.created_at.isoformat(),
            }
        )
        b = by_shop[entry.shop_id]
        b["shop_id"] = entry.shop_id
        b["shop_name"] = entry.shop.name
        b["total"] += entry.amount
        if entry.settled_at is not None:
            b["settled"] += entry.amount

    summary = sorted(
        (
            {
                "shop_id": v["shop_id"],
                "shop_name": v["shop_name"],
                "total": float(v["total"]),
                "settled": float(v["settled"]),
                "outstanding": float(v["total"] - v["settled"]),
            }
            for v in by_shop.values()
        ),
        key=lambda r: r["outstanding"],
        reverse=True,
    )
    return Response({"rows": rows, "by_shop": summary})


@api_view(["GET"])
@permission_classes([IsAdmin])
def commission_invoices(request):
    """List commission invoices, filterable by status / shop / period."""
    qs = CommissionInvoice.objects.select_related("shop").all()
    if (status_f := request.query_params.get("status")):
        qs = qs.filter(status=status_f)
    if (shop_f := request.query_params.get("shop")):
        qs = qs.filter(shop_id=shop_f)
    if (period_f := request.query_params.get("period")):
        qs = qs.filter(period=period_f)

    rows = CommissionInvoiceSerializer(qs[:500], many=True).data
    outstanding = float(
        sum(
            inv.amount
            for inv in qs.filter(status=CommissionInvoice.Status.OPEN)
        )
        or Decimal("0")
    )
    return Response({"rows": rows, "outstanding": outstanding})


@api_view(["POST"])
@permission_classes([IsAdmin])
def generate_commission_invoices(request):
    """Manually trigger monthly invoice generation. Optional `period` in body
    (defaults to previous calendar month). Idempotent."""
    period = request.data.get("period") or None
    invoices = generate_monthly_invoices(period)
    return Response(
        {
            "generated": len(invoices),
            "rows": CommissionInvoiceSerializer(invoices, many=True).data,
        }
    )


@api_view(["POST"])
@permission_classes([IsAdmin])
def settle_commission_invoice(request, invoice_id: int):
    """Mark an invoice paid offline (bank / GCash)."""
    try:
        invoice = CommissionInvoice.objects.select_related("shop").get(pk=invoice_id)
    except CommissionInvoice.DoesNotExist:
        return Response({"detail": "Not found."}, status=404)
    try:
        mark_invoice_paid(
            invoice,
            raw={"settled_by_admin": request.user.id},
            settled_offline=True,
            actor=request.user,
        )
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(CommissionInvoiceSerializer(invoice).data)


@api_view(["POST"])
@permission_classes([IsAdmin])
def void_commission_invoice(request, invoice_id: int):
    try:
        invoice = CommissionInvoice.objects.select_related("shop").get(pk=invoice_id)
    except CommissionInvoice.DoesNotExist:
        return Response({"detail": "Not found."}, status=404)
    try:
        void_invoice(
            invoice, actor=request.user, reason=request.data.get("reason", "")
        )
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(CommissionInvoiceSerializer(invoice).data)
