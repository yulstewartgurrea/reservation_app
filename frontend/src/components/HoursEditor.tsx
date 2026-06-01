"use client";

/**
 * Reusable weekly-hours editor.
 *
 * Backs two pages today: shop hours (`is_closed` / `open_time` / `close_time`)
 * and per-staff hours (`is_off` / `start_time` / `end_time`). Callers map
 * their backend shape into the editor's `WeekRow` via `mapIn` / `mapOut`.
 *
 * UX goals:
 * - One grouped card instead of seven floating ones — less visual noise.
 * - A real toggle switch (44px tap target) for open/closed.
 * - "Apply to weekdays / weekends / all" quick actions so the common case of
 *   identical hours every day takes one click instead of seven.
 * - Sticky save bar at the bottom so the primary action stays reachable
 *   regardless of scroll position.
 * - Reset-on-unsaved-changes and a dirty-state save button — the user can
 *   never accidentally save what they didn't change, or lose track of whether
 *   they've saved.
 */

import { useEffect, useMemo, useState } from "react";
import { Check, RotateCcw } from "lucide-react";

export const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export type WeekRow = {
  weekday: number;
  /** True when this day is closed / off. */
  closed: boolean;
  /** "HH:MM" — meaningful only when closed=false. */
  start: string;
  end: string;
};

function emptyWeek(): WeekRow[] {
  return DAY_NAMES.map((_, weekday) => ({
    weekday,
    closed: true,
    start: "09:00",
    end: "17:00",
  }));
}

function rowsEqual(a: WeekRow[], b: WeekRow[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((row, i) => {
    const other = b[i];
    return (
      row.weekday === other.weekday &&
      row.closed === other.closed &&
      row.start === other.start &&
      row.end === other.end
    );
  });
}

export function HoursEditor<TIn extends { weekday: number }, TOut>({
  load,
  save,
  mapIn,
  mapOut,
  workingLabel = "Open",
}: {
  load: () => Promise<TIn[]>;
  save: (rows: TOut[]) => Promise<void>;
  mapIn: (row: TIn) => Partial<WeekRow>;
  mapOut: (row: WeekRow) => TOut;
  workingLabel?: string;
}) {
  const [hours, setHours] = useState<WeekRow[]>(emptyWeek());
  const [savedHours, setSavedHours] = useState<WeekRow[]>(emptyWeek());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null
  );

  // Initial load — merge server rows over the empty week and snapshot for dirty checking.
  useEffect(() => {
    load().then((rows) => {
      const merged = emptyWeek();
      for (const row of rows ?? []) {
        const incoming = mapIn(row);
        merged[row.weekday] = {
          weekday: row.weekday,
          closed: incoming.closed ?? merged[row.weekday].closed,
          start: incoming.start ?? merged[row.weekday].start,
          end: incoming.end ?? merged[row.weekday].end,
        };
      }
      setHours(merged);
      setSavedHours(merged);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-dismiss success banner after a few seconds; errors persist until next action.
  useEffect(() => {
    if (message?.kind !== "ok") return;
    const handle = setTimeout(() => setMessage(null), 3000);
    return () => clearTimeout(handle);
  }, [message]);

  const isDirty = useMemo(() => !rowsEqual(hours, savedHours), [hours, savedHours]);

  function update(weekday: number, patch: Partial<WeekRow>) {
    setHours((prev) =>
      prev.map((h) => (h.weekday === weekday ? { ...h, ...patch } : h))
    );
  }

  function reset() {
    setHours(savedHours);
    setMessage(null);
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      await save(hours.map(mapOut));
      setSavedHours(hours);
      setMessage({ kind: "ok", text: "Hours saved." });
    } catch (err: any) {
      setMessage({
        kind: "err",
        text: err?.response?.data?.detail ?? "Failed to save.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Day rows */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <ul className="divide-y divide-slate-100">
          {hours.map((h) => (
            <DayRow
              key={h.weekday}
              row={h}
              workingLabel={workingLabel}
              onChange={(patch) => update(h.weekday, patch)}
            />
          ))}
        </ul>
      </div>

      {/* Status banner */}
      {message && (
        <div
          role="status"
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
            message.kind === "ok"
              ? "bg-emerald-50 text-emerald-800"
              : "bg-red-50 text-red-800"
          }`}
        >
          {message.kind === "ok" && <Check size={16} />}
          {message.text}
        </div>
      )}

      {/* Sticky save bar */}
      <div className="sticky bottom-4 z-10 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-lg sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500">
          {isDirty ? "You have unsaved changes." : "All changes saved."}
        </p>
        <div className="flex gap-2 sm:justify-end">
          <button
            type="button"
            onClick={reset}
            disabled={!isDirty || saving}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw size={14} />
            Reset
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || saving}
            className="inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save hours"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DayRow({
  row,
  workingLabel,
  onChange,
}: {
  row: WeekRow;
  workingLabel: string;
  onChange: (patch: Partial<WeekRow>) => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-4 px-5 py-4 sm:flex-nowrap">
      {/* Day name — fixed-width left column */}
      <div className="w-28 flex-shrink-0">
        <span className="font-medium text-slate-900">{DAY_NAMES[row.weekday]}</span>
      </div>

      {/* Hours — flex-1 with justify-center keeps the times in the visual middle */}
      <div className="flex flex-1 items-center justify-center gap-4">
        {row.closed ? (
          <span className="text-sm font-medium text-slate-400">Closed</span>
        ) : (
          <>
            <TimeInput
              value={row.start}
              onChange={(v) => onChange({ start: v })}
              aria-label={`${DAY_NAMES[row.weekday]} open time`}
            />
            <span className="text-slate-400">–</span>
            <TimeInput
              value={row.end}
              onChange={(v) => onChange({ end: v })}
              aria-label={`${DAY_NAMES[row.weekday]} close time`}
            />
          </>
        )}
      </div>

      {/* Toggle — right-aligned */}
      <div className="flex-shrink-0">
        <Toggle
          checked={!row.closed}
          onChange={(checked) => onChange({ closed: !checked })}
          label={workingLabel}
        />
      </div>
    </li>
  );
}

function TimeInput({
  value,
  onChange,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <input
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      {...rest}
    />
  );
}

/**
 * Pill-style toggle switch.
 *
 * Two-layer structure on purpose:
 * - The outer `<button>` is the 44×44 tap target (enforced globally for a11y).
 * - The inner `<span>` is the visible 44×24 pill — keeping the bg/rounded
 *   on the inner element avoids the global min-h/min-w rule warping the
 *   visual into a 44×44 circle.
 *
 * Thumb position uses absolute `left` rather than `translate-x` so its
 * horizontal placement is unambiguous regardless of any inherited flex
 * context.
 */
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="inline-flex select-none items-center gap-2.5">
      <span
        className={`min-w-[44px] text-right text-sm font-medium ${
          checked ? "text-slate-900" : "text-slate-500"
        }`}
      >
        {checked ? label : "Off"}
      </span>
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
    </label>
  );
}
