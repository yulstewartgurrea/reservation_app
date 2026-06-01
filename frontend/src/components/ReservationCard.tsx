"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Info,
  Mail,
  Phone,
  Tag,
  User,
  X,
  type LucideIcon,
} from "lucide-react";
import { formatBookingTime } from "@/lib/format";
import { ActionMenu, ActionMenuItem } from "./ActionMenu";

export type ReservationRow = {
  id: number;
  reference: string;
  shop: number;
  shop_name: string;
  service_name: string;
  service_duration_minutes?: number;
  staff: number | null;
  staff_name?: string | null;
  start_at: string;
  end_at: string;
  status: string;
  source: "online" | "walk_in";
  total_price: string;
  payment_method: "pay_on_arrival" | "online";
  payment_status: "pending" | "paid" | "failed" | "refunded" | null;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_notes?: string;
};

export type CardAction = {
  label: string;
  /** Tailwind classes for the primary button. Ignored when the action is in the overflow menu. */
  className: string;
  onClick: () => void;
  /** Optional lucide icon. */
  icon?: LucideIcon;
  /** Render destructively in the overflow menu (red text). */
  danger?: boolean;
};

const STATUS_PILL: Record<string, { class: string; label: string }> = {
  pending: { class: "bg-amber-100 text-amber-800", label: "Pending" },
  confirmed: { class: "bg-emerald-100 text-emerald-800", label: "Confirmed" },
  completed: { class: "bg-blue-100 text-blue-800", label: "Completed" },
  no_show: { class: "bg-slate-200 text-slate-700", label: "No-show" },
  cancelled_by_customer: {
    class: "bg-slate-100 text-slate-700",
    label: "Cancelled (by customer)",
  },
  cancelled_by_shop: { class: "bg-red-100 text-red-800", label: "Cancelled" },
};

const PAYMENT_PILL: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-800",
  pending: "bg-slate-100 text-slate-700",
  refunded: "bg-amber-100 text-amber-800",
  failed: "bg-red-100 text-red-800",
};

/**
 * Reservation card with:
 * - calendar thumbnail (brand-tinted square)
 * - title (shop name + RSV reference) + optional badge
 * - icon-only detail rows (service, customer, schedule, price)
 * - status + payment pills
 * - expandable "View details" panel (toggled from the overflow menu)
 * - **single primary action** on the right + a **"…" overflow menu** for the rest
 *
 * Action convention: the parent passes a list. The **first** action is the
 * primary brand-colored button; everything else goes into the overflow menu
 * alongside the built-in "View details" toggle.
 */
export function ReservationCard({
  reservation: r,
  actions,
  shopLinkPrefix = "/shops",
  badge,
  id,
  className,
}: {
  reservation: ReservationRow;
  actions: CardAction[];
  shopLinkPrefix?: string;
  badge?: string;
  id?: string;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const hasDetails =
    Boolean(r.customer_email) ||
    Boolean(r.customer_phone) ||
    Boolean(r.customer_notes) ||
    Boolean(r.staff_name) ||
    Boolean(r.service_duration_minutes);

  const primary = actions[0];
  const overflow: ActionMenuItem[] = actions.slice(1).map((a) => ({
    label: a.label,
    onClick: a.onClick,
    icon: a.icon,
    danger: a.danger,
  }));
  if (hasDetails) {
    overflow.unshift({
      label: expanded ? "Hide details" : "View details",
      icon: Info,
      onClick: () => setExpanded((v) => !v),
    });
  }

  const statusInfo = STATUS_PILL[r.status] ?? {
    class: "bg-slate-100 text-slate-700",
    label: r.status,
  };

  return (
    <li
      id={id}
      className={`rounded-2xl border border-slate-200 bg-white p-5 ${className ?? ""}`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* left: thumbnail + body */}
        <div className="flex min-w-0 flex-1 gap-4">
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <CalendarDays size={26} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link
                href={`${shopLinkPrefix}/${r.shop}`}
                className="font-semibold text-slate-900 hover:underline"
              >
                {r.shop_name}
              </Link>
              <span className="text-xs text-slate-400">{r.reference}</span>
              {badge && (
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                  {badge}
                </span>
              )}
            </div>

            <div className="mt-2 space-y-1 text-sm">
              <DetailLine icon={CalendarDays} value={r.service_name} />
              {r.customer_name && <DetailLine icon={User} value={r.customer_name} />}
              <DetailLine icon={Clock} value={formatBookingTime(r.start_at)} />
              <DetailLine icon={Tag} value={`$${r.total_price}`} />
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusInfo.class}`}
              >
                {statusInfo.label}
              </span>
              {r.payment_status && (
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs ${
                    PAYMENT_PILL[r.payment_status] ?? "bg-slate-100 text-slate-700"
                  }`}
                >
                  Payment: {r.payment_status}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* right: primary action + overflow menu */}
        {(primary || overflow.length > 0) && (
          <div className="flex items-center gap-2 sm:flex-shrink-0">
            {primary && (
              <button
                onClick={primary.onClick}
                className={`inline-flex h-10 min-w-[140px] items-center justify-center gap-1.5 rounded-lg px-5 text-sm font-medium ${primary.className}`}
              >
                {primary.icon && <primary.icon size={16} />}
                {primary.label}
              </button>
            )}
            <ActionMenu items={overflow} />
          </div>
        )}
      </div>

      {expanded && hasDetails && (
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 border-t border-slate-100 pt-4 text-sm sm:grid-cols-2">
          {r.customer_email && (
            <DetailRow icon={Mail} label="Email" value={r.customer_email} />
          )}
          {r.customer_phone && (
            <DetailRow icon={Phone} label="Phone" value={r.customer_phone} />
          )}
          {r.staff_name && <DetailRow icon={User} label="Staff" value={r.staff_name} />}
          {r.service_duration_minutes && (
            <DetailRow
              icon={Clock}
              label="Duration"
              value={`${r.service_duration_minutes} min`}
            />
          )}
          <DetailRow icon={Info} label="Reference" value={r.reference} />
          <DetailRow
            icon={r.source === "walk_in" ? User : CheckCircle2}
            label="Source"
            value={r.source === "walk_in" ? "Walk-in" : "Online"}
          />
          {r.customer_notes && (
            <div className="col-span-1 sm:col-span-2">
              <dt className="mb-1 text-slate-500">Customer notes</dt>
              <dd className="whitespace-pre-wrap rounded-md bg-slate-50 p-2 text-slate-900">
                {r.customer_notes}
              </dd>
            </div>
          )}
        </dl>
      )}
    </li>
  );
}

function DetailLine({ icon: Icon, value }: { icon: LucideIcon; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon size={15} className="mt-0.5 flex-shrink-0 text-slate-400" />
      <span className="text-slate-700">{value}</span>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col">
      <dt className="flex items-center gap-1.5 text-slate-500">
        <Icon size={14} />
        {label}
      </dt>
      <dd className="text-slate-900">{value}</dd>
    </div>
  );
}

export { CheckCircle2, Clock, Info, X } from "lucide-react";
