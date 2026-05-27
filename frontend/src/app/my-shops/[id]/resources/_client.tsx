"use client";

/**
 * Stations & Availability — the shop owner's real-time capacity dashboard.
 *
 * A "Station" is the shop's bookable capacity unit (a carwash bay, a salon
 * chair, a treatment room, a table). The NUMBER of active stations is the
 * shop's parallel capacity. Staff is a separate, non-binding "who serves the
 * customer" request and is managed on the Staff page.
 *
 * This page is availability-first: stat cards summarise the day, each station
 * row shows its current status, next-available time and a 8AM–6PM timeline of
 * reservations and time blocks. Picking a station opens a schedule drawer with
 * a day-by-day calendar and a compact bookings list. All resource management
 * actions (rename, add, deactivate, delete, change label) live in modals so
 * the page stays scannable.
 *
 * Day view is the primary experience. The Week toggle is a stub for now (kept
 * visible so the affordance is there, but it just shows a "coming soon" hint).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Clock,
  Grid3x3,
  Pencil,
  Plus,
  Tag,
  Trash2,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";

import { ActionMenu } from "@/components/ActionMenu";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import { Toast, ToastMessage } from "@/components/Toast";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/errors";
import { useUrlParams } from "@/lib/useUrlParams";

type Segment = {
  start: string; // "HH:MM"
  end: string;
  kind: "available" | "reserved" | "blocked";
  label?: string;
};

type Booking = {
  id: number;
  start_at: string;
  end_at: string;
  status: string;
  service_name: string;
  customer_name: string;
};

type Block = {
  id: number;
  start_at: string;
  end_at: string;
  reason: string;
};

type Station = {
  id: number;
  name: string;
  is_active: boolean;
  current_status: "available" | "busy" | "blocked" | "offline" | "closed";
  busy_until: string | null;
  next_available_at: string | null;
  segments: Segment[];
  bookings: Booking[];
  blocks: Block[];
};

type Availability = {
  date: string;
  shop: {
    resource_label: string;
    is_closed: boolean;
    open_time: string | null;
    close_time: string | null;
  };
  summary: {
    total_stations: number;
    available_now: number;
    busy_now: number;
    upcoming_today: number;
  };
  stations: Station[];
};

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseHM(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

function formatHM(s: string | null): string {
  if (!s) return "—";
  const [h, m] = s.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:${String(m).padStart(2, "0")} ${period}`;
}

function formatBookingTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const period = h >= 12 ? "PM" : "AM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:${String(m).padStart(2, "0")} ${period}`;
}

function formatDateLong(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function shiftIsoDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function StationsClient() {
  const { id } = useUrlParams<{ id: string }>("/my-shops/[id]/resources");
  const [date, setDate] = useState(todayIso());
  const [view, setView] = useState<"day" | "week">("day");
  const [data, setData] = useState<Availability | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const [renameTarget, setRenameTarget] = useState<Station | null>(null);
  const [blockTarget, setBlockTarget] = useState<Station | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<Station | null>(
    null
  );
  const [confirmDelete, setConfirmDelete] = useState<Station | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showLabel, setShowLabel] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data } = await api.get<Availability>(
        `/shops/${id}/stations-availability/`,
        { params: { date } }
      );
      setData(data);
    } catch (err) {
      setToast({
        variant: "error",
        message: formatApiError(err, "Failed to load station availability."),
      });
    } finally {
      setLoading(false);
    }
  }, [id, date]);

  useEffect(() => {
    load();
  }, [load]);

  const label = data?.shop.resource_label || "Station";
  const selectedStation = data?.stations.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="py-4">
      <PageHeader
        icon={Grid3x3}
        title="Stations & Availability"
        description="See which stations are free, busy, and when they become available."
        actions={
          <button
            type="button"
            onClick={() => setShowLabel(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Tag size={14} />
            Resource label: <span className="text-slate-900">{label}</span>
            <Pencil size={12} className="text-slate-400" />
          </button>
        }
      />

      <StatCards
        loading={loading}
        summary={data?.summary}
        label={label}
        isClosed={data?.shop.is_closed ?? false}
      />

      <DateRow
        date={date}
        view={view}
        onDate={setDate}
        onView={setView}
        onAdd={() => setShowAdd(true)}
        label={label}
      />

      {view === "week" ? (
        <WeekStub />
      ) : loading && !data ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          Loading stations…
        </p>
      ) : data?.shop.is_closed ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          Shop is closed on {formatDateLong(date)}. Update hours or add an
          override to accept bookings.
        </p>
      ) : data && data.stations.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          No {label.toLowerCase()}s yet. Add your first one to start accepting
          bookings.
        </p>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-4 text-xs text-slate-500">
            <LegendDot color="bg-emerald-300" label="Available" />
            <LegendDot color="bg-orange-400" label="Reserved" />
            <LegendDot color="bg-slate-400" label="Blocked" />
          </div>
          <ul className="space-y-3">
          {data?.stations.map((station) => (
            <StationCard
              key={station.id}
              station={station}
              shopOpen={data.shop.open_time}
              shopClose={data.shop.close_time}
              isSelected={selectedId === station.id}
              onSelect={() => setSelectedId(station.id)}
              onRename={() => setRenameTarget(station)}
              onBlockTime={() => setBlockTarget(station)}
              onDeactivate={() => setConfirmDeactivate(station)}
              onDelete={() => setConfirmDelete(station)}
              onActivate={async () => {
                try {
                  await api.patch(`/shops/resources/${station.id}/`, {
                    is_active: true,
                  });
                  setToast({ variant: "success", message: "Activated." });
                  load();
                } catch (err) {
                  setToast({ variant: "error", message: formatApiError(err) });
                }
              }}
            />
          ))}
          </ul>
        </>
      )}

      {selectedStation && (
        <ScheduleDrawer
          station={selectedStation}
          date={date}
          shopId={id}
          onClose={() => setSelectedId(null)}
          onDateChange={setDate}
          onBlocksChanged={load}
        />
      )}

      {/* Modals */}
      {showAdd && (
        <AddStationModal
          shopId={id!}
          label={label}
          suggestedName={`${label} ${(data?.stations.length ?? 0) + 1}`}
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            setToast({ variant: "success", message: `${label} added.` });
            load();
          }}
          onError={(msg) => setToast({ variant: "error", message: msg })}
        />
      )}
      {showLabel && data && (
        <LabelModal
          shopId={id!}
          currentLabel={label}
          onClose={() => setShowLabel(false)}
          onSaved={(newLabel) => {
            setShowLabel(false);
            setToast({ variant: "success", message: "Label updated." });
            setData((d) =>
              d ? { ...d, shop: { ...d.shop, resource_label: newLabel } } : d
            );
          }}
          onError={(msg) => setToast({ variant: "error", message: msg })}
        />
      )}
      {renameTarget && (
        <RenameModal
          station={renameTarget}
          label={label}
          onClose={() => setRenameTarget(null)}
          onSaved={() => {
            setRenameTarget(null);
            setToast({ variant: "success", message: "Renamed." });
            load();
          }}
          onError={(msg) => setToast({ variant: "error", message: msg })}
        />
      )}
      {blockTarget && (
        <BlockTimeModal
          shopId={Number(id)}
          station={blockTarget}
          defaultDate={date}
          onClose={() => setBlockTarget(null)}
          onSaved={() => {
            setBlockTarget(null);
            setToast({ variant: "success", message: "Time blocked." });
            load();
          }}
          onError={(msg) => setToast({ variant: "error", message: msg })}
        />
      )}

      {confirmDeactivate && (
        <ConfirmationDialog
          open
          title={`Deactivate ${confirmDeactivate.name}?`}
          description={`${confirmDeactivate.name} stops accepting new bookings. Existing bookings are kept. You can reactivate later.`}
          variant="warning"
          confirmLabel="Deactivate"
          onCancel={() => setConfirmDeactivate(null)}
          onConfirm={async () => {
            const target = confirmDeactivate;
            setConfirmDeactivate(null);
            try {
              await api.patch(`/shops/resources/${target.id}/`, {
                is_active: false,
              });
              setToast({ variant: "success", message: "Deactivated." });
              load();
            } catch (err) {
              setToast({ variant: "error", message: formatApiError(err) });
            }
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmationDialog
          open
          title={`Remove ${confirmDelete.name}?`}
          description="If it has bookings it's deactivated (kept for history); otherwise it's deleted. Either way it stops accepting new bookings and your capacity drops by one."
          variant="danger"
          confirmLabel="Remove"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={async () => {
            const target = confirmDelete;
            setConfirmDelete(null);
            try {
              await api.delete(`/shops/resources/${target.id}/`);
              setToast({ variant: "success", message: `${label} removed.` });
              if (selectedId === target.id) setSelectedId(null);
              load();
            } catch (err) {
              setToast({ variant: "error", message: formatApiError(err) });
            }
          }}
        />
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Stat cards
// ────────────────────────────────────────────────────────────────────────────

function StatCards({
  loading,
  summary,
  label,
  isClosed,
}: {
  loading: boolean;
  summary?: Availability["summary"];
  label: string;
  isClosed: boolean;
}) {
  const totals = summary ?? {
    total_stations: 0,
    available_now: 0,
    busy_now: 0,
    upcoming_today: 0,
  };
  return (
    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        label={`Total ${label.toLowerCase()}s`}
        value={totals.total_stations}
        icon={Grid3x3}
        tone="brand"
        loading={loading}
      />
      <StatCard
        label="Available now"
        value={isClosed ? 0 : totals.available_now}
        icon={Check}
        tone="emerald"
        loading={loading}
      />
      <StatCard
        label="Busy now"
        value={isClosed ? 0 : totals.busy_now}
        icon={Users}
        tone="orange"
        loading={loading}
      />
      <StatCard
        label="Upcoming today"
        value={totals.upcoming_today}
        icon={CalendarDays}
        tone="indigo"
        loading={loading}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
  loading,
}: {
  label: string;
  value: number;
  icon: typeof Grid3x3;
  tone: "brand" | "emerald" | "orange" | "indigo";
  loading: boolean;
}) {
  const toneClass: Record<typeof tone, string> = {
    brand: "bg-brand-50 text-brand-700",
    emerald: "bg-emerald-50 text-emerald-700",
    orange: "bg-orange-50 text-orange-700",
    indigo: "bg-indigo-50 text-indigo-700",
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${toneClass[tone]}`}
        >
          <Icon size={18} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {label}
          </p>
          <p className="text-xl font-semibold text-slate-900">
            {loading ? "…" : value}
          </p>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Date row
// ────────────────────────────────────────────────────────────────────────────

function DateRow({
  date,
  view,
  onDate,
  onView,
  onAdd,
  label,
}: {
  date: string;
  view: "day" | "week";
  onDate: (d: string) => void;
  onView: (v: "day" | "week") => void;
  onAdd: () => void;
  label: string;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1">
          <button
            type="button"
            onClick={() => onDate(shiftIsoDate(date, -1))}
            aria-label="Previous day"
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-50"
          >
            <ChevronLeft size={16} />
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => onDate(e.target.value || todayIso())}
            className="rounded-md border-0 px-2 py-1 text-sm font-medium text-slate-900 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <button
            type="button"
            onClick={() => onDate(shiftIsoDate(date, 1))}
            aria-label="Next day"
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-50"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        {date !== todayIso() && (
          <button
            type="button"
            onClick={() => onDate(todayIso())}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Today
          </button>
        )}
        <div className="ml-1 inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
          <button
            type="button"
            onClick={() => onView("day")}
            className={`rounded-md px-3 py-1 font-medium ${
              view === "day"
                ? "bg-brand-600 text-white"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            Day
          </button>
          <button
            type="button"
            onClick={() => onView("week")}
            className={`rounded-md px-3 py-1 font-medium ${
              view === "week"
                ? "bg-brand-600 text-white"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            Week
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
      >
        <Plus size={16} />
        Add {label.toLowerCase()}
      </button>
    </div>
  );
}

function WeekStub() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
      <CalendarDays size={28} className="mx-auto text-slate-400" />
      <p className="mt-2 text-sm font-medium text-slate-900">
        Week view is coming soon
      </p>
      <p className="mt-1 text-sm text-slate-500">
        For now, use the day view to check station-by-station availability.
      </p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Station card + timeline
// ────────────────────────────────────────────────────────────────────────────

function StationCard({
  station,
  shopOpen,
  shopClose,
  isSelected,
  onSelect,
  onRename,
  onBlockTime,
  onDeactivate,
  onActivate,
  onDelete,
}: {
  station: Station;
  shopOpen: string | null;
  shopClose: string | null;
  isSelected: boolean;
  onSelect: () => void;
  onRename: () => void;
  onBlockTime: () => void;
  onDeactivate: () => void;
  onActivate: () => void;
  onDelete: () => void;
}) {
  const moreItems = [
    { label: "Rename", icon: Pencil, onClick: onRename },
    {
      label: "Block time",
      icon: Clock,
      onClick: onBlockTime,
    },
    station.is_active
      ? { label: "Deactivate", onClick: onDeactivate }
      : { label: "Activate", onClick: onActivate },
    { label: "Delete", icon: Trash2, onClick: onDelete, danger: true },
  ];

  return (
    <li
      className={`rounded-2xl border bg-white p-4 transition ${
        isSelected
          ? "border-brand-400 ring-1 ring-brand-200"
          : "border-slate-200"
      }`}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        {/* Name + status block */}
        <div className="flex min-w-0 flex-1 items-start gap-3 lg:max-w-xs">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <Grid3x3 size={18} />
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900">
              {station.name}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              <StatusLine station={station} />
            </p>
          </div>
        </div>

        {/* Timeline */}
        <div className="min-w-0 flex-[2]">
          <Timeline
            segments={station.segments}
            shopOpen={shopOpen}
            shopClose={shopClose}
            isOffline={station.current_status === "offline"}
            isClosed={station.current_status === "closed" && shopOpen === null}
          />
        </div>

        {/* Actions */}
        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onSelect}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            View schedule
            <ChevronsRight size={14} />
          </button>
          <ActionMenu items={moreItems} />
        </div>
      </div>
    </li>
  );
}

function StatusLine({ station }: { station: Station }) {
  if (station.current_status === "offline") {
    return <StatusPill tone="slate">Offline</StatusPill>;
  }
  if (station.current_status === "closed") {
    return <StatusPill tone="slate">Closed today</StatusPill>;
  }
  if (station.current_status === "blocked") {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <StatusPill tone="slate">Blocked</StatusPill>
        {station.busy_until && (
          <span>Until {formatHM(station.busy_until)}</span>
        )}
      </span>
    );
  }
  if (station.current_status === "busy") {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <StatusPill tone="orange">Busy now</StatusPill>
        {station.busy_until && (
          <span>Occupied until {formatHM(station.busy_until)}</span>
        )}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <StatusPill tone="emerald">Available now</StatusPill>
      {station.next_available_at &&
        station.next_available_at !==
          (station.segments[0]?.start ?? null) && (
          <span>· Next free at {formatHM(station.next_available_at)}</span>
        )}
    </span>
  );
}

function StatusPill({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "emerald" | "orange" | "slate";
}) {
  const cls: Record<typeof tone, string> = {
    emerald: "bg-emerald-100 text-emerald-700",
    orange: "bg-orange-100 text-orange-700",
    slate: "bg-slate-100 text-slate-600",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls[tone]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

function Timeline({
  segments,
  shopOpen,
  shopClose,
  isOffline,
  isClosed,
}: {
  segments: Segment[];
  shopOpen: string | null;
  shopClose: string | null;
  isOffline: boolean;
  isClosed: boolean;
}) {
  if (isOffline) {
    return (
      <div className="flex h-12 items-center rounded-lg border border-dashed border-slate-200 px-3 text-xs text-slate-400">
        Inactive — not accepting bookings.
      </div>
    );
  }
  if (isClosed || !shopOpen || !shopClose) {
    return (
      <div className="flex h-12 items-center rounded-lg border border-dashed border-slate-200 px-3 text-xs text-slate-400">
        Shop closed.
      </div>
    );
  }
  const openM = parseHM(shopOpen);
  const closeM = parseHM(shopClose);
  const total = Math.max(closeM - openM, 1);
  const ticks = buildTicks(openM, closeM);

  return (
    <div>
      <div className="relative mb-1 flex justify-between text-[10px] text-slate-400">
        {ticks.map((t) => (
          <span key={t}>{formatHourLabel(t)}</span>
        ))}
      </div>
      <div className="relative h-6 overflow-hidden rounded-lg bg-slate-100">
        {segments.map((seg, idx) => {
          const start = parseHM(seg.start);
          const end = parseHM(seg.end);
          const left = ((start - openM) / total) * 100;
          const width = Math.max(((end - start) / total) * 100, 0.5);
          const color =
            seg.kind === "available"
              ? "bg-emerald-300"
              : seg.kind === "reserved"
                ? "bg-orange-400"
                : "bg-slate-400";
          return (
            <div
              key={idx}
              className={`absolute top-0 h-full ${color}`}
              style={{ left: `${left}%`, width: `${width}%` }}
              title={
                seg.label
                  ? `${formatHM(seg.start)}–${formatHM(seg.end)} · ${seg.label}`
                  : `${formatHM(seg.start)}–${formatHM(seg.end)} · ${seg.kind}`
              }
            />
          );
        })}
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-2 w-2 rounded-sm ${color}`} />
      {label}
    </span>
  );
}

function buildTicks(openM: number, closeM: number): number[] {
  const ticks: number[] = [];
  const span = closeM - openM;
  // Aim for ~5 labels — 2h spacing for an 8–12h day.
  const step = span > 6 * 60 ? 120 : 60;
  const first = Math.ceil(openM / step) * step;
  for (let t = first; t <= closeM; t += step) ticks.push(t);
  if (ticks[0] !== openM) ticks.unshift(openM);
  if (ticks[ticks.length - 1] !== closeM) ticks.push(closeM);
  return ticks;
}

function formatHourLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h >= 12 ? "PM" : "AM";
  const display = h % 12 === 0 ? 12 : h % 12;
  if (m === 0) return `${display}${period}`;
  return `${display}:${String(m).padStart(2, "0")}${period}`;
}

// ────────────────────────────────────────────────────────────────────────────
// Schedule drawer
// ────────────────────────────────────────────────────────────────────────────

function ScheduleDrawer({
  station,
  date,
  shopId,
  onClose,
  onDateChange,
  onBlocksChanged,
}: {
  station: Station;
  date: string;
  shopId: string | undefined;
  onClose: () => void;
  onDateChange: (d: string) => void;
  onBlocksChanged: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-40 flex justify-end bg-slate-900/30"
      onClick={onClose}
    >
      <aside
        className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-slate-900">
              {station.name} schedule
            </h2>
            <p className="text-xs text-slate-500">{formatDateLong(date)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-50"
          >
            <X size={18} />
          </button>
        </header>

        <div className="border-b border-slate-200 px-5 py-4">
          <MiniCalendar selected={date} onSelect={onDateChange} />
        </div>

        <SegmentList segments={station.segments} />

        <BookingsList bookings={station.bookings} shopId={shopId} />
      </aside>
    </div>
  );
}

function MiniCalendar({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (d: string) => void;
}) {
  const [cursor, setCursor] = useState(() => new Date(`${selected}T00:00:00`));

  useEffect(() => {
    setCursor(new Date(`${selected}T00:00:00`));
  }, [selected]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(i);

  const monthLabel = cursor.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const today = todayIso();

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          aria-label="Previous month"
          className="flex h-7 w-7 items-center justify-center rounded text-slate-500 hover:bg-slate-50"
        >
          <ChevronLeft size={16} />
        </button>
        <p className="text-sm font-semibold text-slate-900">{monthLabel}</p>
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          aria-label="Next month"
          className="flex h-7 w-7 items-center justify-center rounded text-slate-500 hover:bg-slate-50"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase text-slate-400">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />;
          const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isSelected = iso === selected;
          const isToday = iso === today;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(iso)}
              className={`flex h-8 items-center justify-center rounded-md text-xs font-medium transition ${
                isSelected
                  ? "bg-brand-600 text-white"
                  : isToday
                    ? "border border-brand-300 text-brand-700"
                    : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SegmentList({ segments }: { segments: Segment[] }) {
  if (segments.length === 0) {
    return (
      <div className="border-b border-slate-200 px-5 py-4 text-xs text-slate-500">
        No schedule for this day.
      </div>
    );
  }
  return (
    <div className="border-b border-slate-200 px-5 py-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Day breakdown
      </p>
      <ul className="space-y-1.5">
        {segments.map((seg, i) => (
          <li
            key={i}
            className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-1.5 text-sm"
          >
            <span className="font-medium text-slate-700">
              {formatHM(seg.start)} – {formatHM(seg.end)}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                seg.kind === "available"
                  ? "bg-emerald-100 text-emerald-700"
                  : seg.kind === "reserved"
                    ? "bg-orange-100 text-orange-700"
                    : "bg-slate-100 text-slate-600"
              }`}
            >
              {seg.kind === "available"
                ? "Open"
                : seg.kind === "reserved"
                  ? (seg.label ?? "Reserved")
                  : (seg.label ?? "Blocked")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BookingsList({
  bookings,
  shopId,
}: {
  bookings: Booking[];
  shopId: string | undefined;
}) {
  const visible = bookings.slice(0, 3);
  return (
    <div className="px-5 py-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Bookings on this day ({bookings.length})
        </p>
        {bookings.length > 0 && shopId && (
          <Link
            href={`/my-shops/${shopId}/reservations`}
            className="text-xs font-medium text-brand-600 hover:underline"
          >
            View all
          </Link>
        )}
      </div>
      {bookings.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-500">
          No bookings.
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((b) => (
            <li
              key={b.id}
              className="rounded-lg border border-slate-100 bg-white p-3 text-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-slate-900">
                  {formatBookingTime(b.start_at)} – {formatBookingTime(b.end_at)}
                </p>
                <StatusPill
                  tone={
                    b.status === "completed"
                      ? "emerald"
                      : b.status === "confirmed"
                        ? "emerald"
                        : "orange"
                  }
                >
                  {b.status.replace(/_/g, " ")}
                </StatusPill>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                {b.customer_name} · {b.service_name}
              </p>
            </li>
          ))}
        </ul>
      )}
      {shopId && (
        <Link
          href={`/my-shops/${shopId}/reservations`}
          className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <CalendarDays size={14} />
          View full calendar
        </Link>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Modals
// ────────────────────────────────────────────────────────────────────────────

function AddStationModal({
  shopId,
  label,
  suggestedName,
  onClose,
  onCreated,
  onError,
}: {
  shopId: string;
  label: string;
  suggestedName: string;
  onClose: () => void;
  onCreated: () => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await api.post("/shops/resources/", {
        shop: Number(shopId),
        name: trimmed,
      });
      onCreated();
    } catch (err) {
      onError(formatApiError(err, "Failed to add."));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={`Add ${label.toLowerCase()}`}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Name
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={suggestedName}
            autoFocus
            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </label>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Adding…" : `Add ${label.toLowerCase()}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function LabelModal({
  shopId,
  currentLabel,
  onClose,
  onSaved,
  onError,
}: {
  shopId: string;
  currentLabel: string;
  onClose: () => void;
  onSaved: (newLabel: string) => void;
  onError: (msg: string) => void;
}) {
  const [value, setValue] = useState(currentLabel);
  const [saving, setSaving] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next = value.trim() || "Station";
    setSaving(true);
    try {
      await api.patch(`/shops/${shopId}/`, { resource_label: next });
      onSaved(next);
    } catch (err) {
      onError(formatApiError(err, "Failed to save label."));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal open onClose={onClose} title="Resource label">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-600">
          The word customers and you see. Try Bay, Chair, Room, Table, or Slot.
        </p>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={32}
          autoFocus
          className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || value.trim() === currentLabel}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RenameModal({
  station,
  label,
  onClose,
  onSaved,
  onError,
}: {
  station: Station;
  label: string;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState(station.name);
  const [saving, setSaving] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await api.patch(`/shops/resources/${station.id}/`, { name: trimmed });
      onSaved();
    } catch (err) {
      onError(formatApiError(err, "Failed to rename."));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={`Rename ${label.toLowerCase()}`}>
      <form onSubmit={submit} className="space-y-4">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim() || name.trim() === station.name}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function BlockTimeModal({
  shopId,
  station,
  defaultDate,
  onClose,
  onSaved,
  onError,
}: {
  shopId: number;
  station: Station;
  defaultDate: string;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const [date, setDate] = useState(defaultDate);
  const [start, setStart] = useState("12:00");
  const [end, setEnd] = useState("13:00");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const valid = useMemo(() => parseHM(end) > parseHM(start), [start, end]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    try {
      // Send local datetimes; the backend stores them in the project tz.
      const startAt = `${date}T${start}:00`;
      const endAt = `${date}T${end}:00`;
      await api.post("/shops/time-blocks/", {
        shop: shopId,
        resource: station.id,
        start_at: startAt,
        end_at: endAt,
        reason: reason.trim(),
      });
      onSaved();
    } catch (err) {
      onError(formatApiError(err, "Failed to block time."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Block time on ${station.name}`}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-600">
          Blocks this {station.name.toLowerCase()} for the chosen window. Use
          this for breaks, maintenance, or staff out-of-office.
        </p>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Date
          </span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Start
            </span>
            <input
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              End
            </span>
            <input
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </label>
        </div>
        {!valid && (
          <p className="text-xs text-red-600">End must be after start.</p>
        )}
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Reason (optional)
          </span>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Break, maintenance, etc."
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </label>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !valid}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Block time"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
