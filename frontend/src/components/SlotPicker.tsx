"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { todayIso } from "@/lib/format";

export type Slot = { start_at: string; end_at: string };

type Props = {
  shopId: number;
  serviceId: number;
  staffId?: number | null;
  /** ISO date string YYYY-MM-DD; if omitted, uses today and exposes a date picker. */
  date?: string;
  onChosen: (startAt: string | null) => void;
  chosen: string | null;
};

/**
 * Calls /reservations/availability/ for the given shop+service+date,
 * renders a date input + a grid of times, and bubbles the chosen ISO start
 * through `onChosen`.
 *
 * Self-contained so booking and reschedule pages don't reimplement the same
 * fetch/loading/render pattern.
 */
export function SlotPicker({ shopId, serviceId, staffId, date, onChosen, chosen }: Props) {
  const [internalDate, setInternalDate] = useState(() => date ?? todayIso());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api
      .get("/reservations/availability/", {
        params: {
          shop: shopId,
          service: serviceId,
          staff: staffId ?? undefined,
          date: internalDate,
        },
      })
      .then((r) => setSlots(r.data))
      .finally(() => setLoading(false));
  }, [shopId, serviceId, staffId, internalDate]);

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium">Date</label>
        <input
          type="date"
          value={internalDate}
          min={todayIso()}
          onChange={(e) => {
            setInternalDate(e.target.value);
            onChosen(null);
          }}
          className="mt-1 rounded-md border border-slate-300 px-3 py-2"
        />
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading slots…</p>
      ) : slots.length === 0 ? (
        <p className="text-sm text-slate-500">No slots available on that day.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {slots.map((s) => (
            <button
              key={s.start_at}
              onClick={() => onChosen(s.start_at)}
              className={`rounded-md border px-2 py-2 text-sm ${
                chosen === s.start_at
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-slate-300 bg-white hover:border-brand-500"
              }`}
            >
              {new Date(s.start_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
