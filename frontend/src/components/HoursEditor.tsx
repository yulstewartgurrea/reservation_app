"use client";

import { useEffect, useState } from "react";

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

/**
 * Reusable weekly-hours editor.
 *
 * Both shop hours (`is_closed`/`open_time`/`close_time`) and per-staff hours
 * (`is_off`/`start_time`/`end_time`) use this component. Callers map their
 * specific field names to/from `WeekRow` via the `mapIn`/`mapOut` props.
 */
export function HoursEditor<TIn extends { weekday: number }, TOut>({
  load,
  save,
  mapIn,
  mapOut,
  workingLabel = "Open",
  description,
  title,
}: {
  load: () => Promise<TIn[]>;
  save: (rows: TOut[]) => Promise<void>;
  mapIn: (row: TIn) => Partial<WeekRow>;
  mapOut: (row: WeekRow) => TOut;
  workingLabel?: string;
  description?: string;
  title: string;
}) {
  const [hours, setHours] = useState<WeekRow[]>(emptyWeek());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

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
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update(weekday: number, patch: Partial<WeekRow>) {
    setHours((prev) => prev.map((h) => (h.weekday === weekday ? { ...h, ...patch } : h)));
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      await save(hours.map(mapOut));
      setMessage({ kind: "ok", text: "Saved." });
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
    <div>
      <h1 className="text-2xl font-semibold">{title}</h1>
      {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
      <div className="mt-4 space-y-2">
        {hours.map((h) => (
          <div
            key={h.weekday}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3"
          >
            <div className="w-24 font-medium">{DAY_NAMES[h.weekday]}</div>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!h.closed}
                onChange={(e) => update(h.weekday, { closed: !e.target.checked })}
              />
              {workingLabel}
            </label>
            <input
              type="time"
              value={h.start}
              onChange={(e) => update(h.weekday, { start: e.target.value })}
              disabled={h.closed}
              className="rounded-md border border-slate-300 px-2 py-1 disabled:bg-slate-50"
            />
            <span>–</span>
            <input
              type="time"
              value={h.end}
              onChange={(e) => update(h.weekday, { end: e.target.value })}
              disabled={h.closed}
              className="rounded-md border border-slate-300 px-2 py-1 disabled:bg-slate-50"
            />
          </div>
        ))}
      </div>
      {message && (
        <p
          className={`mt-3 text-sm ${
            message.kind === "ok" ? "text-emerald-600" : "text-red-600"
          }`}
        >
          {message.text}
        </p>
      )}
      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-4 rounded-md bg-brand-600 px-4 py-2 text-white disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save hours"}
      </button>
    </div>
  );
}
