/**
 * Human-friendly time formatters.
 *
 * `formatBookingTime` returns:
 *   - "Today at 5:00 PM"
 *   - "Tomorrow at 2:00 PM"
 *   - "In 3 days · May 14, 2026 · 9:00 AM"
 *   - "May 11, 2026 · 5:00 PM"  (anything > 7 days out or in the past)
 */

const TIME_OPTS: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  minute: "2-digit",
};

const DATE_OPTS: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function formatBookingTime(iso: string): string {
  const target = new Date(iso);
  const now = new Date();
  const dayDiff = Math.round(
    (startOfDay(target).getTime() - startOfDay(now).getTime()) / (24 * 60 * 60 * 1000)
  );

  const time = target.toLocaleTimeString([], TIME_OPTS);
  const date = target.toLocaleDateString([], DATE_OPTS);

  if (dayDiff === 0) return `Today at ${time}`;
  if (dayDiff === 1) return `Tomorrow at ${time}`;
  if (dayDiff > 1 && dayDiff <= 7) {
    return `In ${dayDiff} days · ${date} · ${time}`;
  }
  if (dayDiff === -1) return `Yesterday at ${time}`;
  return `${date} · ${time}`;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

/**
 * Today as `YYYY-MM-DD` in the user's local timezone. Used as the `min` attr
 * on date inputs so customers can't pick a past date. Local — not UTC —
 * because a user in Asia/Manila at 1 AM should still see today's date.
 */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Current local datetime as `YYYY-MM-DDTHH:MM` — the format `<input
 * type="datetime-local">` expects for its `min` attribute.
 */
export function nowDatetimeLocal(): string {
  const d = new Date();
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` +
    `T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  );
}

/**
 * Format a PHP money amount with the ₱ sign and 2 decimals.
 *
 * Amounts come from the API as decimal strings (e.g. "1234.50") or numbers.
 * Currency is PHP-only platform-wide (PayMongo limitation), so this is the
 * single place that owns ₱ formatting — don't inline `toLocaleString` for
 * money elsewhere.
 */
export function formatPhp(amount: string | number | null | undefined): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount ?? 0;
  if (n == null || Number.isNaN(n)) return "₱0.00";
  return `₱${n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatRsv(id: number | string): string {
  const n = typeof id === "string" ? parseInt(id, 10) : id;
  if (Number.isNaN(n)) return String(id);
  return `RSV-${n.toString().padStart(6, "0")}`;
}

export type WeekdayHoursRow = {
  weekday: number; // 0 = Mon … 6 = Sun (matches backend WeekdayHours.Weekday)
  is_closed: boolean;
  open_time: string | null;
  close_time: string | null;
};

const WEEKDAY_LABEL = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function fmtTime(t: string | null): string {
  if (!t) return "";
  const [hStr, mStr] = t.split(":");
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr ?? "0", 10);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return m === 0 ? `${h}:00 ${ampm}` : `${h}:${m.toString().padStart(2, "0")} ${ampm}`;
}

/**
 * Compress a list of weekday hours into human-friendly lines.
 *
 * Walks Mon → Sun and groups consecutive days with identical schedules. Example
 * outputs:
 *   ["Mon – Sat: 8:00 AM – 6:00 PM", "Sun: Closed"]
 *   ["Mon – Fri: 9:00 AM – 5:00 PM", "Sat – Sun: Closed"]
 */
export function formatHours(rows: WeekdayHoursRow[]): string[] {
  const byDay: Record<number, WeekdayHoursRow | undefined> = {};
  for (const r of rows) byDay[r.weekday] = r;

  type Group = { from: number; to: number; label: string };
  const groups: Group[] = [];

  for (let wd = 0; wd < 7; wd++) {
    const row = byDay[wd];
    const label =
      !row || row.is_closed
        ? "Closed"
        : `${fmtTime(row.open_time)} – ${fmtTime(row.close_time)}`;
    const last = groups[groups.length - 1];
    if (last && last.label === label && last.to === wd - 1) {
      last.to = wd;
    } else {
      groups.push({ from: wd, to: wd, label });
    }
  }

  return groups.map((g) =>
    g.from === g.to
      ? `${WEEKDAY_LABEL[g.from]}: ${g.label}`
      : `${WEEKDAY_LABEL[g.from]} – ${WEEKDAY_LABEL[g.to]}: ${g.label}`
  );
}
