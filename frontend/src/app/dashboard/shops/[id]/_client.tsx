"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  Building2,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  CheckCheck,
  Clock,
  Image as ImageIcon,
  List,
  PauseCircle,
  Pencil,
  PlayCircle,
  UserPlus,
  Users,
  Wrench,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/errors";
import { ServiceCard } from "@/components/ServiceCard";
import {
  CardAction,
  ReservationCard,
  ReservationRow,
} from "@/components/ReservationCard";
import { FilterChip } from "@/components/FilterChip";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { Toast, ToastMessage } from "@/components/Toast";
import { formatBookingTime } from "@/lib/format";

type Shop = {
  id: number;
  name: string;
  city: string;
  status: "active" | "paused" | "pending";
};

type Service = {
  id: number;
  name: string;
  duration_minutes: number;
  price: string;
  is_active: boolean;
  photo?: string | null;
};

type DialogKind = "confirm" | "decline" | "cancel" | "complete" | "no-show" | "refund";

const SUCCESS_MSG: Record<DialogKind, string> = {
  confirm: "Booking confirmed. The customer has been notified.",
  decline: "Booking declined. The customer has been notified.",
  complete: "Booking marked as completed.",
  "no-show": "Marked as no-show.",
  cancel: "Booking cancelled. The customer has been notified.",
  refund: "Refund issued.",
};

const STATUS_PILL: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  paused: "bg-amber-100 text-amber-700",
  pending: "bg-slate-100 text-slate-700",
};

export default function ShopDashboardPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [shop, setShop] = useState<Shop | null>(null);
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [dialog, setDialog] = useState<{
    reservation: ReservationRow;
    kind: DialogKind;
  } | null>(null);
  const [deletingServiceId, setDeletingServiceId] = useState<number | null>(null);
  const [tab, setTab] = useState<"services" | "reservations">("services");
  const [filter, setFilter] = useState<
    "all" | "pending" | "confirmed" | "completed" | "declined"
  >("all");

  const pendingCount = reservations.filter((r) => r.status === "pending").length;

  function matchesFilter(r: ReservationRow): boolean {
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
        return [
          "cancelled_by_customer",
          "cancelled_by_shop",
          "no_show",
        ].includes(r.status);
    }
  }

  const visibleReservations = reservations.filter(matchesFilter);
  const counts = {
    all: reservations.length,
    pending: reservations.filter((r) => r.status === "pending").length,
    confirmed: reservations.filter((r) => r.status === "confirmed").length,
    completed: reservations.filter((r) => r.status === "completed").length,
    declined: reservations.filter((r) =>
      ["cancelled_by_customer", "cancelled_by_shop", "no_show"].includes(r.status)
    ).length,
  };

  async function loadAll() {
    try {
      const [shopRes, resRes, svcRes] = await Promise.all([
        api.get(`/shops/${id}/`),
        api.get(`/reservations/`, { params: { shop: id } }),
        api.get(`/services/`, { params: { shop: id } }),
      ]);
      setShop(shopRes.data);
      setReservations(resRes.data.results ?? resRes.data);
      setServices(svcRes.data.results ?? svcRes.data);
    } catch (err) {
      setToast({ variant: "error", message: formatApiError(err, "Failed to load.") });
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function performAction(r: ReservationRow, kind: DialogKind, reason: string) {
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
      loadAll();
    } catch (err) {
      setToast({ variant: "error", message: formatApiError(err, "Action failed.") });
    }
  }

  async function togglePublish() {
    if (!shop) return;
    const endpoint = shop.status === "active" ? "pause" : "publish";
    try {
      await api.post(`/shops/${id}/${endpoint}/`);
      loadAll();
    } catch (err) {
      setToast({ variant: "error", message: formatApiError(err) });
    }
  }

  async function deleteService() {
    if (deletingServiceId == null) return;
    try {
      await api.delete(`/services/${deletingServiceId}/`);
      setToast({ variant: "success", message: "Service deleted." });
      setDeletingServiceId(null);
      loadAll();
    } catch (err) {
      setToast({ variant: "error", message: formatApiError(err) });
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
    <div className="space-y-6 py-4">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft size={16} />
        Back to dashboard
      </Link>
      {/* HEADER */}
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
            <Building2 size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">
              {shop?.name ?? "Shop dashboard"}
            </h1>
            {shop && (
              <span
                className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  STATUS_PILL[shop.status] ?? "bg-slate-100 text-slate-700"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {shop.status[0].toUpperCase() + shop.status.slice(1)}
              </span>
            )}
          </div>
        </div>

        <nav className="flex flex-wrap gap-2">
          <HeaderLink href={`/dashboard/shops/${id}/edit`} icon={Pencil} label="Edit shop" />
          <HeaderLink href={`/dashboard/shops/${id}/hours`} icon={Clock} label="Hours" />
          <HeaderLink
            href={`/dashboard/shops/${id}/overrides`}
            icon={CalendarClock}
            label="Overrides"
          />
          <HeaderLink href={`/dashboard/shops/${id}/staff`} icon={Users} label="Staff" />
          <HeaderLink
            href={`/dashboard/shops/${id}/photos`}
            icon={ImageIcon}
            label="Photos"
          />
          <HeaderLink
            href={`/dashboard/shops/${id}/analytics`}
            icon={BarChart3}
            label="Analytics"
          />
          <button
            onClick={togglePublish}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            {shop?.status === "active" ? (
              <>
                <PauseCircle size={16} />
                Pause shop
              </>
            ) : (
              <>
                <PlayCircle size={16} />
                Publish shop
              </>
            )}
          </button>
        </nav>
      </header>

      {/* TABS */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav className="flex border-b border-slate-200">
          <TabButton
            active={tab === "services"}
            onClick={() => setTab("services")}
            icon={Wrench}
            label="Services"
          />
          <TabButton
            active={tab === "reservations"}
            onClick={() => setTab("reservations")}
            icon={CalendarDays}
            label="Reservations"
            badge={pendingCount > 0 ? pendingCount : undefined}
          />
        </nav>
        {pendingCount > 0 && (
          <button
            onClick={() => setTab("reservations")}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-amber-700 hover:bg-amber-50"
          >
            <Clock size={14} />
            {pendingCount} pending booking{pendingCount === 1 ? "" : "s"}
          </button>
        )}
      </div>

      {/* SERVICES */}
      <section className={`rounded-2xl border border-slate-200 bg-white p-5 ${tab === "services" ? "" : "hidden"}`}>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Services</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Manage the services you offer to your customers.
            </p>
          </div>
          <Link
            href={`/dashboard/shops/${id}/services/new`}
            className="inline-flex items-center gap-1.5 self-start rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <span className="text-base leading-none">+</span>
            New service
          </Link>
        </div>

        {services.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
            No services yet. Add one to start accepting bookings.
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {services.map((s) => (
              <ServiceCard
                key={s.id}
                service={s}
                editHref={`/dashboard/shops/${id}/services/${s.id}/edit`}
                onDelete={() => setDeletingServiceId(s.id)}
              />
            ))}
          </ul>
        )}
      </section>

      {/* RESERVATIONS */}
      <section className={`rounded-2xl border border-slate-200 bg-white p-5 ${tab === "reservations" ? "" : "hidden"}`}>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Reservations</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Manage incoming and upcoming bookings from your customers.
            </p>
          </div>
          <Link
            href={`/dashboard/shops/${id}/walk-in`}
            className="inline-flex items-center gap-1.5 self-start rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <span className="text-base leading-none">+</span>
            Walk-in
          </Link>
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
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

        {visibleReservations.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
            {reservations.length === 0
              ? "No reservations yet."
              : `No ${filter === "all" ? "" : filter + " "}bookings to show.`}
          </p>
        ) : (
          <ul className="space-y-3">
            {visibleReservations.map((r) => (
              <ReservationCard
                key={r.id}
                reservation={r}
                actions={buildActions(r)}
                shopLinkPrefix="/dashboard/shops"
                badge={r.source === "walk_in" ? "walk-in" : undefined}
              />
            ))}
          </ul>
        )}
      </section>

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
          onConfirm={(reason) => performAction(dialog.reservation, dialog.kind, reason)}
          onCancel={() => setDialog(null)}
        />
      )}

      {deletingServiceId != null && (
        <ConfirmationDialog
          open
          title="Delete this service?"
          description="Past reservations using this service stay intact, but customers won't be able to book it anymore."
          variant="danger"
          confirmLabel="Delete service"
          onConfirm={deleteService}
          onCancel={() => setDeletingServiceId(null)}
        />
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

function HeaderLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof CalendarDays;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
    >
      <Icon size={16} className="text-slate-500" />
      {label}
    </Link>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition ${
        active
          ? "border-brand-600 text-brand-600"
          : "border-transparent text-slate-600 hover:text-slate-900"
      }`}
    >
      <Icon size={18} />
      {label}
      {badge !== undefined && (
        <span className="ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-100 px-1.5 text-xs font-medium text-amber-800">
          {badge}
        </span>
      )}
    </button>
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
