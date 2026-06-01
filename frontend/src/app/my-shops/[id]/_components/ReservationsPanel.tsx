"use client";

/**
 * Reservations panel — header + status filter chips + reservation list.
 *
 * Self-contained: owns its own toast + per-row action confirmation dialog.
 * Used as the leaf of `/my-shops/[id]/reservations/page.tsx`.
 *
 * The list is fetched once and filtered client-side by status chip — a shop
 * typically has a small open queue. Promote to server-side pagination if a
 * shop hits hundreds of bookings at once.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCheck,
  CheckCircle2,
  Clock,
  LayoutList,
  List,
  PauseCircle,
  X,
  XCircle,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/errors";
import {
  CardAction,
  ReservationCard,
  ReservationRow,
} from "@/components/ReservationCard";
import { FilterChip } from "@/components/FilterChip";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { Toast, ToastMessage } from "@/components/Toast";
import { formatBookingTime } from "@/lib/format";
import { ReservationsCalendar } from "./ReservationsCalendar";
import { ReservationEventModal } from "./ReservationEventModal";

type ActionKind = "confirm" | "decline" | "cancel" | "complete" | "no-show" | "refund";
type StatusFilter = "all" | "pending" | "confirmed" | "completed" | "declined";
type ViewLayout = "list" | "calendar";

const DECLINED_STATUSES = ["cancelled_by_customer", "cancelled_by_shop", "no_show"];

const SUCCESS_MSG: Record<ActionKind, string> = {
  confirm: "Booking confirmed. The customer has been notified.",
  decline: "Booking declined. The customer has been notified.",
  complete: "Booking marked as completed.",
  "no-show": "Marked as no-show.",
  cancel: "Booking cancelled. The customer has been notified.",
  refund: "Refund issued.",
};

const DIALOG_TITLE: Record<ActionKind, string> = {
  confirm: "Confirm this booking?",
  decline: "Decline this booking?",
  complete: "Mark as completed?",
  "no-show": "Mark as no-show?",
  cancel: "Cancel this booking?",
  refund: "Refund this booking?",
};

const DIALOG_CONFIRM: Record<ActionKind, string> = {
  confirm: "Confirm booking",
  decline: "Decline booking",
  complete: "Mark completed",
  "no-show": "Mark no-show",
  cancel: "Cancel booking",
  refund: "Refund",
};

export function ReservationsPanel({ shopId }: { shopId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusParam = searchParams.get("focus");
  const focusId = focusParam ? Number(focusParam) : null;
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [layout, setLayout] = useState<ViewLayout>("list");
  const [selected, setSelected] = useState<ReservationRow | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const [dialog, setDialog] = useState<{
    reservation: ReservationRow;
    kind: ActionKind;
  } | null>(null);

  const fetchList = useCallback(async () => {
    try {
      const res = await api.get("/reservations/", { params: { shop: shopId } });
      setReservations(res.data.results ?? res.data);
    } catch (err) {
      setToast({
        variant: "error",
        message: formatApiError(err, "Failed to load reservations."),
      });
    }
  }, [shopId]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // When arriving from a notification (?focus=<id>), make sure the row is
  // visible (force "all" filter + list layout), then scroll and highlight.
  useEffect(() => {
    if (!focusId || reservations.length === 0) return;
    if (!reservations.some((r) => r.id === focusId)) return;
    if (filter !== "all") setFilter("all");
    if (layout !== "list") setLayout("list");
    const el = document.getElementById(`reservation-${focusId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    setHighlightedId(focusId);
    const timer = window.setTimeout(() => setHighlightedId(null), 2500);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, reservations]);

  const counts = useMemo(
    () => ({
      all: reservations.length,
      pending: reservations.filter((r) => r.status === "pending").length,
      confirmed: reservations.filter((r) => r.status === "confirmed").length,
      completed: reservations.filter((r) => r.status === "completed").length,
      declined: reservations.filter((r) => DECLINED_STATUSES.includes(r.status)).length,
    }),
    [reservations]
  );

  const visible = reservations.filter((r) => matchesFilter(r, filter));

  async function performAction(reason: string) {
    if (!dialog) return;
    const { reservation: r, kind } = dialog;
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
      fetchList();
    } catch (err) {
      setToast({
        variant: "error",
        message: formatApiError(err, "Action failed."),
      });
    }
  }

  function buildActions(r: ReservationRow): CardAction[] {
    const actions: CardAction[] = [];
    if (r.status === "pending") {
      actions.push({
        label: "Confirm",
        icon: CheckCircle2,
        className: "bg-brand-600 text-white hover:bg-brand-700",
        onClick: () => setDialog({ reservation: r, kind: "confirm" }),
      });
      actions.push({
        label: "Suggest new time",
        icon: Clock,
        className: "border border-slate-300 text-slate-700 hover:bg-slate-50",
        onClick: () => router.push(`/reservations/${r.id}/reschedule`),
      });
      actions.push({
        label: "Decline",
        icon: X,
        className: "border border-red-300 text-red-700 hover:bg-red-50",
        onClick: () => setDialog({ reservation: r, kind: "decline" }),
        danger: true,
      });
    } else if (r.status === "confirmed") {
      actions.push({
        label: "Mark as completed",
        icon: CheckCircle2,
        className: "bg-emerald-600 text-white hover:bg-emerald-700",
        onClick: () => setDialog({ reservation: r, kind: "complete" }),
      });
      actions.push({
        label: "No-show",
        icon: X,
        className: "bg-amber-600 text-white hover:bg-amber-700",
        onClick: () => setDialog({ reservation: r, kind: "no-show" }),
      });
      actions.push({
        label: "Cancel booking",
        icon: X,
        className: "border border-red-300 text-red-700 hover:bg-red-50",
        onClick: () => setDialog({ reservation: r, kind: "cancel" }),
        danger: true,
      });
      if (r.payment_status === "paid") {
        actions.push({
          label: "Refund",
          icon: PauseCircle,
          className: "border border-amber-400 text-amber-800 hover:bg-amber-50",
          onClick: () => setDialog({ reservation: r, kind: "refund" }),
        });
      }
    }
    return actions;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Reservations</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage incoming and upcoming bookings from your customers.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start">
          <div
            className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-sm"
            role="tablist"
            aria-label="Reservations view"
          >
            <button
              role="tab"
              aria-selected={layout === "list"}
              onClick={() => setLayout("list")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition ${
                layout === "list"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <LayoutList size={16} />
              List
            </button>
            <button
              role="tab"
              aria-selected={layout === "calendar"}
              onClick={() => setLayout("calendar")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition ${
                layout === "calendar"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <CalendarDays size={16} />
              Calendar
            </button>
          </div>
          <Link
            href={`/my-shops/${shopId}/walk-in`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            <span className="text-base leading-none">+</span>
            Walk-in
          </Link>
        </div>
      </div>

      {layout === "calendar" ? (
        <ReservationsCalendar
          reservations={reservations}
          onEventClick={(r) => setSelected(r)}
        />
      ) : (
        <>
      <div className="flex flex-wrap gap-2">
        <FilterChip
          active={filter === "all"}
          onClick={() => setFilter("all")}
          icon={List}
          label="All"
          color="slate"
          count={counts.all || undefined}
        />
        <FilterChip
          active={filter === "pending"}
          onClick={() => setFilter("pending")}
          icon={Clock}
          label="Pending"
          color="amber"
          count={counts.pending || undefined}
        />
        <FilterChip
          active={filter === "confirmed"}
          onClick={() => setFilter("confirmed")}
          icon={CheckCircle2}
          label="Confirmed"
          color="emerald"
          count={counts.confirmed || undefined}
        />
        <FilterChip
          active={filter === "completed"}
          onClick={() => setFilter("completed")}
          icon={CheckCheck}
          label="Completed"
          color="blue"
          count={counts.completed || undefined}
        />
        <FilterChip
          active={filter === "declined"}
          onClick={() => setFilter("declined")}
          icon={XCircle}
          label="Declined"
          color="red"
          count={counts.declined || undefined}
        />
      </div>

      {visible.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          {reservations.length === 0
            ? "No reservations yet."
            : `No ${filter === "all" ? "" : filter + " "}bookings to show.`}
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
              shopLinkPrefix="/my-shops"
              badge={r.source === "walk_in" ? "walk-in" : undefined}
            />
          ))}
        </ul>
      )}
        </>
      )}

      <ReservationEventModal
        reservation={selected}
        actions={selected ? buildActions(selected) : []}
        onClose={() => setSelected(null)}
      />

      {dialog && (
        <ConfirmationDialog
          open
          title={DIALOG_TITLE[dialog.kind]}
          variant={
            dialog.kind === "confirm" || dialog.kind === "complete"
              ? "primary"
              : dialog.kind === "no-show" || dialog.kind === "refund"
                ? "warning"
                : "danger"
          }
          confirmLabel={DIALOG_CONFIRM[dialog.kind]}
          requireReason={dialog.kind === "decline" || dialog.kind === "cancel"}
          reasonPlaceholder={
            dialog.kind === "decline" ? "Not available at this time" : ""
          }
          context={[
            { label: "Service", value: dialog.reservation.service_name },
            { label: "When", value: formatBookingTime(dialog.reservation.start_at) },
            {
              label: "Customer",
              value: dialog.reservation.customer_name ?? "—",
            },
            { label: "Reference", value: dialog.reservation.reference },
          ]}
          onConfirm={performAction}
          onCancel={() => setDialog(null)}
        />
      )}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

function matchesFilter(r: ReservationRow, filter: StatusFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "pending":
      return r.status === "pending";
    case "confirmed":
      return r.status === "confirmed";
    case "completed":
      return r.status === "completed";
    case "declined":
      return DECLINED_STATUSES.includes(r.status);
  }
}
