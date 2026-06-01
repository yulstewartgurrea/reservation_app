"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarCheck2 } from "lucide-react";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/errors";
import { formatBookingTime } from "@/lib/format";
import {
  CardAction,
  ReservationCard,
  ReservationRow,
} from "@/components/ReservationCard";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { PageHeader } from "@/components/PageHeader";
import { Toast, ToastMessage } from "@/components/Toast";

type Review = { id: number; reservation: number; rating: number };

type Tab = "all" | "pending" | "confirmed" | "completed" | "cancelled";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "confirmed", label: "Confirmed" },
  { id: "completed", label: "Past" },
  { id: "cancelled", label: "Cancelled" },
];

const CANCELLED_STATUSES = new Set([
  "cancelled_by_customer",
  "cancelled_by_shop",
  "no_show",
]);

function tabMatches(tab: Tab, status: string): boolean {
  if (tab === "all") return true;
  if (tab === "cancelled") return CANCELLED_STATUSES.has(status);
  return tab === status;
}

type DialogKind = "cancel";

type PendingDialog = {
  reservation: ReservationRow;
  kind: DialogKind;
};

const SUCCESS_MSG: Record<DialogKind, string> = {
  cancel: "Booking cancelled. The shop has been notified.",
};

type Props = {
  /** When provided, a Back button is rendered in the header. */
  onBack?: () => void;
};

function BookingsPanelInner({ onBack }: Props) {
  const router = useRouter();
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
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Arriving from a notification (?focus=<id>): scroll into view, highlight,
  // and switch to "all" so filters don't hide the row.
  useEffect(() => {
    if (!focusId || loading || items.length === 0) return;
    if (!items.some((r) => r.id === focusId)) return;
    if (tab !== "all") setTab("all");
    const el = document.getElementById(`reservation-${focusId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedId(focusId);
    const timer = window.setTimeout(() => setHighlightedId(null), 2500);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, loading, items]);

  async function load() {
    setLoading(true);
    try {
      const [reservationsRes, reviewsRes] = await Promise.all([
        api.get("/reservations/"),
        api.get("/reviews/"),
      ]);
      setItems(reservationsRes.data.results ?? reservationsRes.data);
      const reviews: Review[] = reviewsRes.data.results ?? reviewsRes.data;
      setReviewedIds(new Set(reviews.map((x) => x.reservation)));
    } catch (err) {
      setToast({ variant: "error", message: formatApiError(err, "Failed to load.") });
    } finally {
      setLoading(false);
    }
  }

  async function performAction(d: PendingDialog, reason: string) {
    const { reservation: r, kind } = d;
    try {
      await api.post(`/reservations/${r.id}/${kind}/`, { reason });
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
        setToast({
          variant: "error",
          message: formatApiError(err, "Could not start payment."),
        })
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

  return (
    <div className="space-y-4 py-4">
      <PageHeader
        onBack={onBack}
        backLabel={onBack ? "Back" : undefined}
        icon={CalendarCheck2}
        title="My bookings"
        description="Manage your upcoming and past bookings."
      />

      <nav className="-mx-1 flex flex-wrap gap-1 overflow-x-auto">
        {TABS.map((t) => {
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
                className={`ml-1.5 text-xs ${
                  active ? "text-slate-300" : "text-slate-400"
                }`}
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
                highlightedId === r.id ? "ring-2 ring-brand-400 ring-offset-2" : ""
              }`}
              reservation={r}
              actions={customerActions(r)}
              shopLinkPrefix="/shops"
            />
          ))}
        </ul>
      )}

      {dialog && (
        <ConfirmationDialog
          open
          title="Cancel this booking?"
          variant="danger"
          confirmLabel="Cancel booking"
          requireReason
          context={[
            { label: "Service", value: dialog.reservation.service_name },
            { label: "When", value: formatBookingTime(dialog.reservation.start_at) },
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

export function BookingsPanel(props: Props) {
  return (
    <Suspense
      fallback={<p className="py-12 text-center text-sm text-slate-500">Loading…</p>}
    >
      <BookingsPanelInner {...props} />
    </Suspense>
  );
}
