"use client";

/**
 * Pop-up shown when an owner clicks a reservation on the calendar.
 *
 * Reuses the same `CardAction` list the list view renders — keeps the
 * "what can I do here" logic in one place. The actual confirmation
 * dialogs stay with the parent.
 */

import {
  CalendarDays,
  Clock,
  Info,
  Mail,
  Phone,
  Tag,
  User,
  type LucideIcon,
} from "lucide-react";
import { Modal } from "@/components/Modal";
import type { CardAction, ReservationRow } from "@/components/ReservationCard";
import { formatBookingTime } from "@/lib/format";

const STATUS_PILL: Record<string, { class: string; label: string }> = {
  pending: { class: "bg-amber-100 text-amber-800", label: "Pending" },
  confirmed: { class: "bg-emerald-100 text-emerald-800", label: "Confirmed" },
  completed: { class: "bg-blue-100 text-blue-800", label: "Completed" },
};

const PAYMENT_PILL: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-800",
  pending: "bg-slate-100 text-slate-700",
  refunded: "bg-amber-100 text-amber-800",
  failed: "bg-red-100 text-red-800",
};

export function ReservationEventModal({
  reservation,
  actions,
  onClose,
}: {
  reservation: ReservationRow | null;
  actions: CardAction[];
  onClose: () => void;
}) {
  if (!reservation) return null;
  const status = STATUS_PILL[reservation.status] ?? {
    class: "bg-slate-100 text-slate-700",
    label: reservation.status,
  };
  return (
    <Modal open onClose={onClose} title={reservation.service_name}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-400">{reservation.reference}</span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.class}`}
          >
            {status.label}
          </span>
          {reservation.payment_status && (
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs ${
                PAYMENT_PILL[reservation.payment_status] ??
                "bg-slate-100 text-slate-700"
              }`}
            >
              Payment: {reservation.payment_status}
            </span>
          )}
          {reservation.source === "walk_in" && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
              walk-in
            </span>
          )}
        </div>

        <dl className="grid grid-cols-1 gap-3 text-sm">
          <DetailLine
            icon={Clock}
            label="When"
            value={formatBookingTime(reservation.start_at)}
          />
          {reservation.customer_name && (
            <DetailLine
              icon={User}
              label="Customer"
              value={reservation.customer_name}
            />
          )}
          {reservation.customer_email && (
            <DetailLine
              icon={Mail}
              label="Email"
              value={reservation.customer_email}
            />
          )}
          {reservation.customer_phone && (
            <DetailLine
              icon={Phone}
              label="Phone"
              value={reservation.customer_phone}
            />
          )}
          {reservation.staff_name && (
            <DetailLine
              icon={User}
              label="Staff"
              value={reservation.staff_name}
            />
          )}
          {reservation.service_duration_minutes && (
            <DetailLine
              icon={CalendarDays}
              label="Duration"
              value={`${reservation.service_duration_minutes} min`}
            />
          )}
          <DetailLine
            icon={Tag}
            label="Total"
            value={`$${reservation.total_price}`}
          />
          {reservation.customer_notes && (
            <div className="flex flex-col gap-1">
              <dt className="flex items-center gap-1.5 text-slate-500">
                <Info size={14} />
                Customer notes
              </dt>
              <dd className="whitespace-pre-wrap rounded-md bg-slate-50 p-2 text-slate-900">
                {reservation.customer_notes}
              </dd>
            </div>
          )}
        </dl>

        {actions.length > 0 ? (
          <div className="flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:flex-wrap">
            {actions.map((a) => (
              <button
                key={a.label}
                onClick={() => {
                  onClose();
                  a.onClick();
                }}
                className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-medium ${a.className}`}
              >
                {a.icon && <a.icon size={16} />}
                {a.label}
              </button>
            ))}
          </div>
        ) : (
          <p className="border-t border-slate-100 pt-4 text-sm text-slate-500">
            No actions available for this reservation.
          </p>
        )}

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}

function DetailLine({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon size={15} className="mt-0.5 flex-shrink-0 text-slate-400" />
      <div className="min-w-0">
        <dt className="text-xs uppercase tracking-wide text-slate-500">
          {label}
        </dt>
        <dd className="text-slate-900">{value}</dd>
      </div>
    </div>
  );
}
