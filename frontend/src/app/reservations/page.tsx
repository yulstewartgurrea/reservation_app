"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarCheck2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
// Note: shop owners are redirected from this page to /my-shops because they
// manage bookings per-shop now. The customer "My bookings" view stays here.
import { formatApiError } from "@/lib/errors";
import {
  CardAction,
  ReservationCard,
  ReservationRow,
} from "@/components/ReservationCard";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { PageHeader } from "@/components/PageHeader";
import { Toast, ToastMessage } from "@/components/Toast";
import { formatBookingTime } from "@/lib/format";

type Review = { id: number; reservation: number; rating: number };

type Tab = "all" | "pending" | "confirmed" | "completed" | "cancelled";

const OWNER_TABS: { id: Tab; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "confirmed", label: "Confirmed" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
  { id: "all", label: "All" },
];

const CUSTOMER_TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "confirmed", label: "Confirmed" },
  { id: "completed", label: "Past" },
  { id: "cancelled", label: "Cancelled" },
];

function tabMatches(tab: Tab, status: string): boolean {
  if (tab === "all") return true;
  if (tab === "pending") return status === "pending";
  if (tab === "confirmed") return status === "confirmed";
  if (tab === "completed") return status === "completed";
  if (tab === "cancelled") {
    return ["cancelled_by_customer", "cancelled_by_shop", "no_show"].includes(status);
  }
  return true;
}

type DialogKind = "confirm" | "decline" | "cancel" | "complete" | "no-show" | "refund";

type PendingDialog = {
  reservation: ReservationRow;
  kind: DialogKind;
};

const SUCCESS_MSG: Record<DialogKind, string> = {
  confirm: "Booking confirmed. The customer has been notified.",
  decline: "Booking declined. The customer has been notified.",
  complete: "Booking marked as completed.",
  "no-show": "Marked as no-show.",
  cancel: "Booking cancelled. The customer has been notified.",
  refund: "Refund issued.",
};

export default function ReservationsPage() {
  const router = useRouter();
  const { user, fetchMe } = useAuth();
  const searchParams = useSearchParams();
  const focusParam = searchParams.get("focus");
  const focusId = focusParam ? Number(focusParam) : null;

  const [items, setItems] = useState<ReservationRow[]>([]);
  const [reviewedIds, setReviewedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("all");
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [dialog, setDialog] = useState<PendingDialog | null>(null);
  const [highlightedId, setHighlightedId] = useState<number | null>(null);

  useEffect(() => {
    fetchMe();
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isOwner = user?.role === "shop_owner";

  // Shop owners manage reservations per-shop under /my-shops/<id>/reservations.
  // If one lands here directly (old bookmark, browser back), bounce them to
  // their shops list rather than showing a duplicate cross-shop inbox.
  useEffect(() => {
    if (isOwner) {
      router.replace("/my-shops");
    }
  }, [isOwner, router]);

  // Default tab for the customer view; owners never reach this since they
  // get redirected above.
  useEffect(() => {
    if (isOwner && tab === "all") setTab("pending");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner]);

  // When arriving from a notification (?focus=<id>), make sure the row is
  // visible (switch to "all" so filters don't hide it), then scroll to it and
  // apply a brief ring highlight.
  useEffect(() => {
    if (!focusId || loading || items.length === 0) return;
    if (!items.some((r) => r.id === focusId)) return;
    if (tab !== "all") setTab("all");
    const el = document.getElementById(`reservation-${focusId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    setHighlightedId(focusId);
    const timer = window.setTimeout(() => setHighlightedId(null), 2500);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, loading, items]);

  async function load() {
    setLoading(true);
    try {
      const reservationsRes = await api.get("/reservations/");
      setItems(reservationsRes.data.results ?? reservationsRes.data);
      if (user?.role !== "shop_owner") {
        const reviewsRes = await api.get("/reviews/");
        const reviews: Review[] = reviewsRes.data.results ?? reviewsRes.data;
        setReviewedIds(new Set(reviews.map((x) => x.reservation)));
      }
    } catch (err) {
      setToast({ variant: "error", message: formatApiError(err, "Failed to load.") });
    } finally {
      setLoading(false);
    }
  }

  async function performAction(d: PendingDialog, reason: string) {
    const { reservation: r, kind } = d;
    try {
      if (kind === "refund") {
        await api.post(`/payments/reservations/${r.id}/refund/`);
      } else if (kind === "decline" || kind === "cancel") {
        await api.post(`/reservations/${r.id}/cancel/`, { reason });
      } else {
        await api.post(`/reservations/${r.id}/${kind}/`, { reason });
      }
      setToast({ variant: "success", message: SUCCESS_MSG[kind] });
      setDialog(null);
      load();
    } catch (err) {
      setToast({ variant: "error", message: formatApiError(err, "Action failed.") });
    }
  }

  function payNow(id: number) {
    api
      .post(`/payments/reservations/${id}/checkout/`)
      .then(({ data }) => {
        if (data.checkout_url) window.location.href = data.checkout_url;
      })
      .catch((err) =>
        setToast({ variant: "error", message: formatApiError(err, "Could not start payment.") })
      );
  }

  const visible = useMemo(
    () => items.filter((r) => tabMatches(tab, r.status)),
    [items, tab]
  );

  const tabCounts = useMemo(() => {
    const counts: Record<Tab, number> = {
      all: items.length,
      pending: 0,
      confirmed: 0,
      completed: 0,
      cancelled: 0,
    };
    for (const r of items) {
      if (tabMatches("pending", r.status)) counts.pending++;
      else if (tabMatches("confirmed", r.status)) counts.confirmed++;
      else if (tabMatches("completed", r.status)) counts.completed++;
      else if (tabMatches("cancelled", r.status)) counts.cancelled++;
    }
    return counts;
  }, [items]);

  function buildActions(r: ReservationRow): CardAction[] {
    if (isOwner) return ownerActions(r);
    return customerActions(r);
  }

  function ownerActions(r: ReservationRow): CardAction[] {
    const actions: CardAction[] = [];
    if (r.status === "pending") {
      actions.push({
        label: "Confirm",
        className: "bg-brand-600 text-white hover:bg-brand-700",
        onClick: () => setDialog({ reservation: r, kind: "confirm" }),
      });
      actions.push({
        label: "Suggest new time",
        className: "border border-slate-300 hover:bg-slate-50",
        onClick: () => router.push(`/reservations/${r.id}/reschedule`),
      });
      actions.push({
        label: "Decline",
        className: "border border-red-300 text-red-700 hover:bg-red-50",
        onClick: () => setDialog({ reservation: r, kind: "decline" }),
      });
    } else if (r.status === "confirmed") {
      actions.push({
        label: "Mark as completed",
        className: "bg-emerald-600 text-white hover:bg-emerald-700",
        onClick: () => setDialog({ reservation: r, kind: "complete" }),
      });
      actions.push({
        label: "No-show",
        className: "bg-amber-600 text-white hover:bg-amber-700",
        onClick: () => setDialog({ reservation: r, kind: "no-show" }),
      });
      actions.push({
        label: "Cancel booking",
        className: "border border-red-300 text-red-700 hover:bg-red-50",
        onClick: () => setDialog({ reservation: r, kind: "cancel" }),
      });
      if (r.payment_status === "paid") {
        actions.push({
          label: "Refund",
          className: "border border-amber-400 text-amber-800 hover:bg-amber-50",
          onClick: () => setDialog({ reservation: r, kind: "refund" }),
        });
      }
    }
    return actions;
  }

  function customerActions(r: ReservationRow): CardAction[] {
    const actions: CardAction[] = [];
    if (
      r.status === "pending" &&
      r.payment_method === "online" &&
      r.payment_status !== "paid"
    ) {
      actions.push({
        label: "Pay now",
        className: "bg-emerald-600 text-white hover:bg-emerald-700",
        onClick: () => payNow(r.id),
      });
    }
    if (r.status === "pending" || r.status === "confirmed") {
      actions.push({
        label: "Reschedule",
        className: "border border-slate-300 hover:bg-slate-50",
        onClick: () => router.push(`/reservations/${r.id}/reschedule`),
      });
      actions.push({
        label: "Cancel",
        className: "border border-red-300 text-red-700 hover:bg-red-50",
        onClick: () => setDialog({ reservation: r, kind: "cancel" }),
      });
    }
    if (r.status === "completed" && !reviewedIds.has(r.id)) {
      actions.push({
        label: "Leave review",
        className: "bg-brand-600 text-white hover:bg-brand-700",
        onClick: () => router.push(`/reservations/${r.id}/review`),
      });
    }
    return actions;
  }

  const tabs = isOwner ? OWNER_TABS : CUSTOMER_TABS;

  return (
    <div className="space-y-4 py-4">
      <PageHeader
        onBack={() => router.back()}
        backLabel="Back"
        icon={CalendarCheck2}
        title={isOwner ? "Inbox" : "My reservations"}
        description={
          isOwner
            ? "Incoming bookings across all your shops."
            : "Manage your upcoming and past bookings."
        }
      />

      <nav className="-mx-1 flex flex-wrap gap-1 overflow-x-auto">
        {tabs.map((t) => {
          const active = tab === t.id;
          const count = tabCounts[t.id];
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`mx-1 rounded-md px-3 py-1.5 text-sm ${
                active
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {t.label}
              <span
                className={`ml-1.5 text-xs ${active ? "text-slate-300" : "text-slate-400"}`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </nav>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          Nothing here.
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((r) => (
            <ReservationCard
              key={r.id}
              id={`reservation-${r.id}`}
              className={`scroll-mt-24 transition-shadow ${
                highlightedId === r.id
                  ? "ring-2 ring-brand-400 ring-offset-2"
                  : ""
              }`}
              reservation={r}
              actions={buildActions(r)}
              shopLinkPrefix={isOwner ? "/my-shops" : "/shops"}
              badge={r.source === "walk_in" ? "walk-in" : undefined}
            />
          ))}
        </ul>
      )}

      {dialog && (
        <ConfirmationDialog
          open
          title={dialogTitle(dialog.kind)}
          variant={
            dialog.kind === "confirm" || dialog.kind === "complete"
              ? "primary"
              : dialog.kind === "no-show" || dialog.kind === "refund"
                ? "warning"
                : "danger"
          }
          confirmLabel={dialogConfirmLabel(dialog.kind)}
          requireReason={dialog.kind === "decline" || dialog.kind === "cancel"}
          reasonPlaceholder={dialog.kind === "decline" ? "Not available at this time" : ""}
          context={[
            { label: "Service", value: dialog.reservation.service_name },
            { label: "When", value: formatBookingTime(dialog.reservation.start_at) },
            { label: "Customer", value: dialog.reservation.customer_name ?? "—" },
            { label: "Reference", value: dialog.reservation.reference },
          ]}
          onConfirm={(reason) => performAction(dialog, reason)}
          onCancel={() => setDialog(null)}
        />
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

function dialogTitle(kind: DialogKind): string {
  switch (kind) {
    case "confirm":
      return "Confirm this booking?";
    case "decline":
      return "Decline this booking?";
    case "complete":
      return "Mark as completed?";
    case "no-show":
      return "Mark as no-show?";
    case "cancel":
      return "Cancel this booking?";
    case "refund":
      return "Refund this booking?";
  }
}

function dialogConfirmLabel(kind: DialogKind): string {
  switch (kind) {
    case "confirm":
      return "Confirm booking";
    case "decline":
      return "Decline booking";
    case "complete":
      return "Mark completed";
    case "no-show":
      return "Mark no-show";
    case "cancel":
      return "Cancel booking";
    case "refund":
      return "Refund";
  }
}
