"use client";

/**
 * Date overrides page.
 *
 * Backend contract:
 * - `POST /shops/<id>/overrides/` is an upsert keyed by `(shop, date)`, so
 *   editing an existing override just means re-submitting with the same date.
 *   We pre-fill the form, lock the date input, and submit to update.
 * - `DELETE /shops/<id>/overrides/<override_id>/` removes a row.
 *
 * UX layout follows the mockup:
 * - "Add override" card with a toggle for "closed all day" + start/end times,
 *   plus quick-preset chips that pre-fill the times.
 * - "Upcoming overrides" card with Upcoming / Past tabs and per-row Edit /
 *   Delete actions.
 */

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  CalendarClock,
  Clock,
  Info,
  Moon,
  Pencil,
  Sun,
  Trash2,
  X as XIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/errors";
import { todayIso } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { Toast, ToastMessage } from "@/components/Toast";

type Override = {
  id: number;
  date: string; // "YYYY-MM-DD"
  is_closed: boolean;
  open_time: string | null;
  close_time: string | null;
  note: string;
};

type Preset = "closed" | "late" | "half" | "custom";

type FormState = {
  date: string;
  is_closed: boolean;
  open_time: string;
  close_time: string;
  note: string;
};

const EMPTY_FORM: FormState = {
  date: "",
  is_closed: true,
  open_time: "09:00",
  close_time: "17:00",
  note: "",
};

export default function OverridesPage() {
  const { id } = useParams<{ id: string }>();
  const [items, setItems] = useState<Override[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  /** When set, the form is editing this override (lock date, swap labels). */
  const [editingId, setEditingId] = useState<number | null>(null);
  const [activePreset, setActivePreset] = useState<Preset>("closed");
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  async function load() {
    try {
      const { data } = await api.get(`/shops/${id}/overrides/`);
      setItems(data);
    } catch (err) {
      setToast({
        variant: "error",
        message: formatApiError(err, "Failed to load overrides."),
      });
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Partition into upcoming/past relative to today's date.
  const { upcoming, past } = useMemo(() => {
    const today = todayIso();
    const upcoming: Override[] = [];
    const past: Override[] = [];
    for (const o of items) {
      (o.date >= today ? upcoming : past).push(o);
    }
    upcoming.sort((a, b) => a.date.localeCompare(b.date));
    past.sort((a, b) => b.date.localeCompare(a.date));
    return { upcoming, past };
  }, [items]);

  const visible = tab === "upcoming" ? upcoming : past;

  function applyPreset(preset: Preset) {
    setActivePreset(preset);
    setForm((f) => {
      switch (preset) {
        case "closed":
          return { ...f, is_closed: true };
        case "late":
          return { ...f, is_closed: false, open_time: "12:00", close_time: f.close_time };
        case "half":
          return { ...f, is_closed: false, open_time: f.open_time, close_time: "13:00" };
        case "custom":
          return { ...f, is_closed: false };
      }
    });
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setActivePreset("closed");
  }

  function startEdit(o: Override) {
    setEditingId(o.id);
    setForm({
      date: o.date,
      is_closed: o.is_closed,
      open_time: o.open_time ?? "09:00",
      close_time: o.close_time ?? "17:00",
      note: o.note,
    });
    setActivePreset(o.is_closed ? "closed" : "custom");
    // Scroll the form into view for clarity on long pages.
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/shops/${id}/overrides/`, {
        date: form.date,
        is_closed: form.is_closed,
        open_time: form.is_closed ? null : form.open_time,
        close_time: form.is_closed ? null : form.close_time,
        note: form.note,
      });
      setToast({
        variant: "success",
        message: editingId ? "Override updated." : "Override added.",
      });
      resetForm();
      load();
    } catch (err) {
      setToast({
        variant: "error",
        message: formatApiError(err, "Failed to save override."),
      });
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (deletingId == null) return;
    try {
      await api.delete(`/shops/${id}/overrides/${deletingId}/`);
      setToast({ variant: "success", message: "Override removed." });
      // If we were editing the row we just deleted, clear the form too.
      if (editingId === deletingId) resetForm();
      setDeletingId(null);
      load();
    } catch (err) {
      setToast({ variant: "error", message: formatApiError(err) });
    }
  }

  return (
    <div className="mx-auto max-w-5xl py-6">
      <PageHeader
        icon={CalendarClock}
        title="Date overrides"
        description="Use this for holidays, special hours, or one-off closures. Overrides take precedence over weekly hours."
        actions={
          <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
            <Info size={12} />
            For exceptions only
          </span>
        }
      />

      {/* ADD / EDIT FORM */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-slate-900">
            {editingId ? "Edit override" : "Add override"}
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Examples: holiday closure, special opening hours
          </p>
        </div>

        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <FieldLabel label="Date">
              <input
                type="date"
                value={form.date}
                min={editingId ? undefined : todayIso()}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                required
                disabled={Boolean(editingId)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50 disabled:text-slate-500"
              />
            </FieldLabel>

            <FieldLabel label="Closed all day">
              <div className="flex flex-col gap-1.5">
                <Toggle
                  checked={form.is_closed}
                  onChange={(checked) =>
                    setForm((f) => ({ ...f, is_closed: checked }))
                  }
                />
                <span className="text-xs text-slate-500">
                  {form.is_closed
                    ? "We'll close your shop for the day."
                    : "Set custom open hours below."}
                </span>
              </div>
            </FieldLabel>

            <FieldLabel label="Start time">
              <input
                type="time"
                value={form.open_time}
                onChange={(e) => setForm((f) => ({ ...f, open_time: e.target.value }))}
                disabled={form.is_closed}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50 disabled:text-slate-400"
              />
            </FieldLabel>

            <FieldLabel label="End time">
              <input
                type="time"
                value={form.close_time}
                onChange={(e) => setForm((f) => ({ ...f, close_time: e.target.value }))}
                disabled={form.is_closed}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50 disabled:text-slate-400"
              />
            </FieldLabel>

            <FieldLabel label="Note (optional)">
              <input
                type="text"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="e.g. Christmas Day"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <span className="mt-1 block text-xs text-slate-500">
                Add a note for you and your customers.
              </span>
            </FieldLabel>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-slate-500">Quick presets</span>
              <PresetButton
                active={activePreset === "closed"}
                onClick={() => applyPreset("closed")}
                icon={XIcon}
                label="Closed all day"
              />
              <PresetButton
                active={activePreset === "late"}
                onClick={() => applyPreset("late")}
                icon={Moon}
                label="Open late"
              />
              <PresetButton
                active={activePreset === "half"}
                onClick={() => applyPreset("half")}
                icon={Sun}
                label="Open half day"
              />
              <PresetButton
                active={activePreset === "custom"}
                onClick={() => applyPreset("custom")}
                icon={Clock}
                label="Custom hours"
              />
            </div>
            <div className="flex gap-2">
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={saving || !form.date}
                className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving
                  ? "Saving…"
                  : editingId
                    ? "Save changes"
                    : "Add override"}
              </button>
            </div>
          </div>
        </form>
      </section>

      {/* LIST */}
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white">
        <header className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            {tab === "upcoming" ? "Upcoming overrides" : "Past overrides"}
          </h2>
        </header>

        <div className="flex gap-6 border-b border-slate-200 px-5">
          <TabButton
            active={tab === "upcoming"}
            onClick={() => setTab("upcoming")}
            label="Upcoming"
            count={upcoming.length}
          />
          <TabButton
            active={tab === "past"}
            onClick={() => setTab("past")}
            label="Past"
            count={past.length}
          />
        </div>

        {visible.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">
            {tab === "upcoming"
              ? "No upcoming overrides. Add one above for an upcoming holiday or special day."
              : "No past overrides."}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visible.map((o) => (
              <OverrideRow
                key={o.id}
                override={o}
                onEdit={() => startEdit(o)}
                onDelete={() => setDeletingId(o.id)}
              />
            ))}
          </ul>
        )}

        <footer className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          <span>
            Showing {visible.length} of {items.length} overrides
          </span>
          <span>Overrides are applied to your regular hours.</span>
        </footer>
      </section>

      {deletingId != null && (
        <ConfirmationDialog
          open
          title="Remove this override?"
          description="The override will be removed and the day will fall back to your regular weekly hours."
          variant="danger"
          confirmLabel="Remove override"
          onConfirm={confirmDelete}
          onCancel={() => setDeletingId(null)}
        />
      )}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

function FieldLabel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function PresetButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Clock;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        active
          ? "border-brand-300 bg-brand-50 text-brand-700"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      <Icon size={13} />
      {label}
    </button>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-1 py-3 text-sm font-medium transition ${
        active
          ? "border-brand-600 text-brand-700"
          : "border-transparent text-slate-600 hover:text-slate-900"
      }`}
    >
      {label}
      {count > 0 && (
        <span className="ml-1.5 text-xs text-slate-400">({count})</span>
      )}
    </button>
  );
}

function OverrideRow({
  override,
  onEdit,
  onDelete,
}: {
  override: Override;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
      <div className="flex flex-1 items-center gap-4">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
          <CalendarClock size={18} />
        </div>
        <div className="min-w-0">
          <p className="font-medium text-slate-900">{formatLongDate(override.date)}</p>
          <p className="text-xs text-slate-500">{formatWeekday(override.date)}</p>
        </div>
      </div>

      <div className="flex-shrink-0">
        {override.is_closed ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
            <XIcon size={12} />
            Closed all day
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
            <Clock size={12} />
            {formatTime(override.open_time)} – {formatTime(override.close_time)}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1 truncate text-sm text-slate-600">
        {override.note || <span className="text-slate-300">—</span>}
      </div>

      <div className="flex flex-shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Pencil size={14} />
          Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Remove override"
          className="inline-flex items-center justify-center rounded-md border border-red-200 px-2.5 py-1.5 text-red-600 hover:bg-red-50"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </li>
  );
}

/** Pill-style toggle switch — same pattern as HoursEditor (44 px tap target,
 * inner span carries the visible pill so the global min-h rule doesn't warp it). */
function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex flex-shrink-0 items-center justify-start"
    >
      <span
        aria-hidden
        className={`relative inline-block h-6 w-11 rounded-full transition-colors ${
          checked ? "bg-brand-600" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] duration-150 ${
            checked ? "left-[22px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

/** "Dec 25, 2026" — parsed as a local date so display matches the input. */
function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatWeekday(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short" });
}

/** "13:30" -> "1:30 PM". Returns "—" for empty input. */
function formatTime(t: string | null): string {
  if (!t) return "—";
  const [hStr, m] = t.split(":");
  const h = Number(hStr);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${suffix}`;
}
