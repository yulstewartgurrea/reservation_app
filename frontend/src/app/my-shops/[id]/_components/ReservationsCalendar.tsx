"use client";

/**
 * Google-Calendar-style view of a shop's reservations.
 *
 * Day / Week / Month toggle, prev/next/today navigation. Only renders
 * `pending`, `confirmed`, and `completed` rows — cancelled / no-show /
 * declined entries are hidden so the canvas stays focused on actionable
 * bookings.
 *
 * Pure presentation: takes the already-fetched `reservations` list and
 * lays it out. No data fetching, no mutations — actions still happen in
 * the list view.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReservationRow } from "@/components/ReservationCard";

type ViewMode = "day" | "week" | "month";
type CalendarEvent = ReservationRow & { start: Date; end: Date };

const VISIBLE_STATUSES = new Set(["pending", "confirmed", "completed"]);

const STATUS_COLOR: Record<
  string,
  { bg: string; border: string; text: string; dot: string; label: string }
> = {
  pending: {
    bg: "bg-amber-100",
    border: "border-amber-300",
    text: "text-amber-900",
    dot: "bg-amber-500",
    label: "Pending",
  },
  confirmed: {
    bg: "bg-emerald-100",
    border: "border-emerald-300",
    text: "text-emerald-900",
    dot: "bg-emerald-500",
    label: "Confirmed",
  },
  completed: {
    bg: "bg-blue-100",
    border: "border-blue-300",
    text: "text-blue-900",
    dot: "bg-blue-500",
    label: "Completed",
  },
};

const WEEKDAY_SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const HOUR_HEIGHT = 48;
const DEFAULT_SCROLL_HOUR = 7;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
}
function startOfMonth(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}
function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function fmtTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function fmtHourLabel(h: number): string {
  const ampm = h >= 12 ? "PM" : "AM";
  const display = h % 12 || 12;
  return `${display} ${ampm}`;
}

export function ReservationsCalendar({
  reservations,
  onEventClick,
}: {
  reservations: ReservationRow[];
  onEventClick?: (r: ReservationRow) => void;
}) {
  const [view, setView] = useState<ViewMode>("week");
  const [cursor, setCursor] = useState<Date>(() => startOfDay(new Date()));

  const events: CalendarEvent[] = useMemo(
    () =>
      reservations
        .filter((r) => VISIBLE_STATUSES.has(r.status))
        .map((r) => ({ ...r, start: new Date(r.start_at), end: new Date(r.end_at) })),
    [reservations]
  );

  const title = useMemo(() => {
    if (view === "day") {
      return cursor.toLocaleDateString([], {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    }
    if (view === "week") {
      const ws = startOfWeek(cursor);
      const we = addDays(ws, 6);
      if (ws.getMonth() === we.getMonth())
        return `${MONTH_LONG[ws.getMonth()]} ${ws.getFullYear()}`;
      if (ws.getFullYear() === we.getFullYear())
        return `${MONTH_LONG[ws.getMonth()].slice(0, 3)} – ${MONTH_LONG[we.getMonth()].slice(0, 3)} ${ws.getFullYear()}`;
      return `${MONTH_LONG[ws.getMonth()].slice(0, 3)} ${ws.getFullYear()} – ${MONTH_LONG[we.getMonth()].slice(0, 3)} ${we.getFullYear()}`;
    }
    return `${MONTH_LONG[cursor.getMonth()]} ${cursor.getFullYear()}`;
  }, [view, cursor]);

  function onPrev() {
    if (view === "day") setCursor(addDays(cursor, -1));
    else if (view === "week") setCursor(addDays(cursor, -7));
    else setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
  }
  function onNext() {
    if (view === "day") setCursor(addDays(cursor, 1));
    else if (view === "week") setCursor(addDays(cursor, 7));
    else setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setCursor(startOfDay(new Date()))}
            className="rounded-full border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Today
          </button>
          <button
            onClick={onPrev}
            aria-label="Previous"
            className="grid h-9 w-9 place-items-center rounded-full text-slate-600 hover:bg-slate-100"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={onNext}
            aria-label="Next"
            className="grid h-9 w-9 place-items-center rounded-full text-slate-600 hover:bg-slate-100"
          >
            <ChevronRight size={18} />
          </button>
          <span className="ml-1 text-base font-semibold text-slate-900 sm:text-lg">
            {title}
          </span>
        </div>
        <div className="inline-flex self-start rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-sm">
          {(["day", "week", "month"] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1.5 capitalize transition ${
                view === v
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {view === "day" && (
        <DayView day={cursor} events={events} onEventClick={onEventClick} />
      )}
      {view === "week" && (
        <WeekView
          weekStart={startOfWeek(cursor)}
          events={events}
          onEventClick={onEventClick}
        />
      )}
      {view === "month" && (
        <MonthView
          month={cursor}
          events={events}
          onPickDay={(d) => {
            setCursor(d);
            setView("day");
          }}
          onEventClick={onEventClick}
        />
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-600">
        <span className="font-medium">Legend:</span>
        {(["pending", "confirmed", "completed"] as const).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${STATUS_COLOR[s].dot}`} />
            {STATUS_COLOR[s].label}
          </span>
        ))}
      </div>
    </div>
  );
}

function eventsForDay(events: CalendarEvent[], day: Date) {
  return events
    .filter((e) => sameDay(e.start, day))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

function useScrollToWorkHours(deps: unknown[]) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = DEFAULT_SCROLL_HOUR * HOUR_HEIGHT;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

function DayView({
  day,
  events,
  onEventClick,
}: {
  day: Date;
  events: CalendarEvent[];
  onEventClick?: (r: ReservationRow) => void;
}) {
  const dayEvents = eventsForDay(events, day);
  const scrollRef = useScrollToWorkHours([day.toDateString()]);
  return (
    <div ref={scrollRef} className="max-h-[640px] overflow-auto">
      <div
        className="grid"
        style={{ gridTemplateColumns: "60px minmax(0, 1fr)" }}
      >
        <HourGutter />
        <DayColumn day={day} events={dayEvents} onEventClick={onEventClick} />
      </div>
    </div>
  );
}

function WeekView({
  weekStart,
  events,
  onEventClick,
}: {
  weekStart: Date;
  events: CalendarEvent[];
  onEventClick?: (r: ReservationRow) => void;
}) {
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );
  const scrollRef = useScrollToWorkHours([weekStart.toDateString()]);
  const today = new Date();
  return (
    <div>
      <div
        className="grid border-b border-slate-100"
        style={{ gridTemplateColumns: "60px repeat(7, minmax(0, 1fr))" }}
      >
        <div />
        {days.map((d) => {
          const isToday = sameDay(d, today);
          return (
            <div
              key={d.toISOString()}
              className="border-l border-slate-100 py-2 text-center"
            >
              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                {WEEKDAY_SHORT[d.getDay()]}
              </div>
              <div
                className={`mx-auto mt-1 grid h-9 w-9 place-items-center rounded-full text-sm font-semibold ${
                  isToday ? "bg-brand-600 text-white" : "text-slate-800"
                }`}
              >
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>
      <div ref={scrollRef} className="max-h-[640px] overflow-auto">
        <div
          className="grid"
          style={{ gridTemplateColumns: "60px repeat(7, minmax(0, 1fr))" }}
        >
          <HourGutter />
          {days.map((d) => (
            <DayColumn
              key={d.toISOString()}
              day={d}
              events={eventsForDay(events, d)}
              onEventClick={onEventClick}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function MonthView({
  month,
  events,
  onPickDay,
  onEventClick,
}: {
  month: Date;
  events: CalendarEvent[];
  onPickDay: (d: Date) => void;
  onEventClick?: (r: ReservationRow) => void;
}) {
  const first = startOfMonth(month);
  const gridStart = startOfWeek(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const today = new Date();
  return (
    <div>
      <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-center text-[11px] font-medium uppercase tracking-wide text-slate-600">
        {WEEKDAY_SHORT.map((w) => (
          <div key={w} className="py-2">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d) => {
          const inMonth = d.getMonth() === month.getMonth();
          const dayEvents = eventsForDay(events, d);
          const isToday = sameDay(d, today);
          return (
            <div
              key={d.toISOString()}
              className={`flex min-h-[96px] flex-col items-stretch gap-0.5 border-b border-r border-slate-100 p-1.5 text-left ${
                inMonth ? "bg-white" : "bg-slate-50/60"
              }`}
            >
              <button
                onClick={() => onPickDay(d)}
                aria-label={`View ${d.toDateString()}`}
                className={`mb-1 inline-grid h-6 w-6 place-items-center self-start rounded-full text-xs font-semibold transition hover:ring-2 hover:ring-brand-300 ${
                  isToday
                    ? "bg-brand-600 text-white"
                    : inMonth
                      ? "text-slate-800 hover:bg-slate-100"
                      : "text-slate-400 hover:bg-slate-100"
                }`}
              >
                {d.getDate()}
              </button>
              {dayEvents.slice(0, 3).map((e) => {
                const c = STATUS_COLOR[e.status];
                return (
                  <button
                    key={e.id}
                    onClick={() => onEventClick?.(e)}
                    className={`flex items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] transition hover:ring-2 hover:ring-offset-1 ${c.bg} ${c.text}`}
                    title={`${fmtTime(e.start)} · ${e.service_name} · ${e.customer_name ?? "—"}`}
                  >
                    <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${c.dot}`} />
                    <span className="truncate">
                      {fmtTime(e.start)} {e.service_name}
                    </span>
                  </button>
                );
              })}
              {dayEvents.length > 3 && (
                <button
                  onClick={() => onPickDay(d)}
                  className="px-1 text-left text-[11px] text-slate-500 hover:text-slate-700"
                >
                  +{dayEvents.length - 3} more
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HourGutter() {
  return (
    <div className="relative bg-white">
      {Array.from({ length: 24 }, (_, h) => (
        <div
          key={h}
          style={{ height: HOUR_HEIGHT }}
          className="relative border-t border-transparent"
        >
          {h > 0 && (
            <span className="absolute -top-2 right-2 text-[11px] text-slate-400">
              {fmtHourLabel(h)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function DayColumn({
  day,
  events,
  onEventClick,
}: {
  day: Date;
  events: CalendarEvent[];
  onEventClick?: (r: ReservationRow) => void;
}) {
  const isToday = sameDay(day, new Date());
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return (
    <div className="relative border-l border-slate-100">
      {Array.from({ length: 24 }, (_, h) => (
        <div
          key={h}
          style={{ height: HOUR_HEIGHT }}
          className="border-t border-slate-100"
        />
      ))}
      {events.map((e) => {
        const startMin = Math.max(0, e.start.getHours() * 60 + e.start.getMinutes());
        const endMin = Math.min(
          24 * 60,
          e.end.getHours() * 60 + e.end.getMinutes() || startMin + 30
        );
        const top = (startMin / 60) * HOUR_HEIGHT;
        const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 22);
        const c = STATUS_COLOR[e.status];
        return (
          <button
            key={e.id}
            onClick={() => onEventClick?.(e)}
            style={{ top, height, left: 4, right: 4 }}
            title={`${e.service_name} · ${e.customer_name ?? "—"} · ${fmtTime(e.start)}–${fmtTime(e.end)}`}
            className={`absolute overflow-hidden rounded-md border text-left ${c.bg} ${c.border} ${c.text} px-2 py-1 text-[11px] leading-tight shadow-sm transition hover:shadow-md hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-brand-400`}
          >
            <div className="truncate font-semibold">{e.service_name}</div>
            <div className="truncate opacity-80">
              {fmtTime(e.start)} · {e.customer_name ?? "—"}
            </div>
          </button>
        );
      })}
      {isToday && (
        <div
          className="pointer-events-none absolute left-0 right-0 z-10 flex items-center"
          style={{ top: (nowMin / 60) * HOUR_HEIGHT }}
        >
          <span className="-ml-1 h-2 w-2 rounded-full bg-red-500" />
          <span className="h-px flex-1 bg-red-500" />
        </div>
      )}
    </div>
  );
}
