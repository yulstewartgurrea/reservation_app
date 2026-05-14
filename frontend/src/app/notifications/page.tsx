"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  Calendar,
  CalendarCheck,
  CalendarX,
  CheckCheck,
  ChevronRight,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatApiError } from "@/lib/errors";
import { notificationHref, type NotificationRecord } from "@/lib/notifications";
import { PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";

const PAGE_SIZE = 20;

type Filter = "all" | "unread";

export default function NotificationsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [marking, setMarking] = useState(false);

  const load = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/notifications/?page=${targetPage}`);
      const results: NotificationRecord[] = data.results ?? data;
      setItems(results.filter((n) => n.title));
      setTotal(typeof data.count === "number" ? data.count : results.length);
    } catch (err) {
      setError(formatApiError(err, "Failed to load notifications."));
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(page);
  }, [load, page]);

  function changePage(next: number) {
    setPage(next);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  const unreadCount = useMemo(
    () => items.filter((n) => !n.read_at).length,
    [items],
  );

  const filteredItems = useMemo(
    () => (filter === "unread" ? items.filter((n) => !n.read_at) : items),
    [items, filter],
  );

  const groups = useMemo(() => groupByDate(filteredItems), [filteredItems]);

  async function markAllRead() {
    if (marking || unreadCount === 0) return;
    setMarking(true);
    const now = new Date().toISOString();
    const previous = items;
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    try {
      await api.post("/notifications/mark-all-read/");
    } catch (err) {
      setItems(previous);
      setError(formatApiError(err, "Failed to mark notifications as read."));
    } finally {
      setMarking(false);
    }
  }

  const headerActions =
    unreadCount > 0 ? (
      <button
        type="button"
        onClick={markAllRead}
        disabled={marking}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <CheckCheck size={16} />
        Mark all read
      </button>
    ) : null;

  return (
    <div className="space-y-6 py-4">
      <PageHeader
        onBack={() => router.back()}
        backLabel="Back"
        icon={Bell}
        title="Notifications"
        description={
          loading
            ? undefined
            : total === 0
              ? "You're all caught up — nothing here yet."
              : `${total} notification${total === 1 ? "" : "s"} total${
                  unreadCount > 0 ? ` · ${unreadCount} unread` : ""
                }.`
        }
        actions={headerActions}
      />

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </p>
      )}

      <FilterTabs filter={filter} onChange={setFilter} unreadCount={unreadCount} />

      {loading && items.length === 0 ? (
        <ListSkeleton />
      ) : filteredItems.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.label}>
              <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {group.label}
              </h2>
              <ul className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                {group.items.map((n) => (
                  <NotificationRow
                    key={n.id}
                    notification={n}
                    href={notificationHref(n, user?.role)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {total > PAGE_SIZE && (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={changePage}
          unitLabel="notifications"
        />
      )}
    </div>
  );
}

function NotificationRow({
  notification: n,
  href,
}: {
  notification: NotificationRecord;
  href: string | null;
}) {
  const meta = kindMeta(n.kind);
  const Icon = meta.icon;
  const isUnread = !n.read_at;

  const rowClass = `relative flex items-start gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 ${
    isUnread ? "bg-brand-50/40" : ""
  } ${href ? "hover:bg-slate-50" : ""}`;

  const inner = (
    <>
      {isUnread && (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-1 bg-brand-500"
        />
      )}
      <span
        className={`mt-0.5 inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${meta.iconWrap}`}
        aria-hidden="true"
      >
        <Icon size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div
            className={`min-w-0 text-sm ${
              isUnread ? "font-semibold text-slate-900" : "font-medium text-slate-800"
            }`}
          >
            <span className="line-clamp-2">{n.title}</span>
          </div>
          <time
            className="flex-shrink-0 text-xs text-slate-500"
            dateTime={n.created_at}
          >
            {formatRelative(n.created_at)}
          </time>
        </div>
        {n.body && (
          <div className="mt-0.5 line-clamp-2 text-sm text-slate-600">{n.body}</div>
        )}
      </div>
      {href && (
        <ChevronRight
          size={16}
          className="mt-3 flex-shrink-0 text-slate-300"
          aria-hidden="true"
        />
      )}
    </>
  );

  return (
    <li>
      {href ? (
        <Link href={href} className={rowClass}>
          {inner}
        </Link>
      ) : (
        <div className={rowClass}>{inner}</div>
      )}
    </li>
  );
}

function FilterTabs({
  filter,
  onChange,
  unreadCount,
}: {
  filter: Filter;
  onChange: (f: Filter) => void;
  unreadCount: number;
}) {
  const tab = (value: Filter, label: string, count?: number) => {
    const active = filter === value;
    return (
      <button
        type="button"
        onClick={() => onChange(value)}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition ${
          active
            ? "bg-slate-900 text-white"
            : "bg-white text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
        }`}
        aria-pressed={active}
      >
        {label}
        {typeof count === "number" && count > 0 && (
          <span
            className={`rounded-full px-1.5 text-xs font-semibold ${
              active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"
            }`}
          >
            {count}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="flex flex-wrap gap-2">
      {tab("all", "All")}
      {tab("unread", "Unread", unreadCount)}
    </div>
  );
}

type KindMeta = {
  icon: LucideIcon;
  iconWrap: string; // tailwind classes for bg + text color
};

function kindMeta(kind: string): KindMeta {
  if (kind === "chat.new_message") {
    return { icon: MessageSquare, iconWrap: "bg-sky-100 text-sky-700" };
  }
  if (kind === "reminder") {
    return { icon: Bell, iconWrap: "bg-amber-100 text-amber-700" };
  }
  if (kind === "booking_new") {
    return { icon: Calendar, iconWrap: "bg-brand-100 text-brand-700" };
  }
  if (kind === "booking_confirmed") {
    return { icon: CalendarCheck, iconWrap: "bg-emerald-100 text-emerald-700" };
  }
  if (kind === "booking_completed") {
    return { icon: CheckCheck, iconWrap: "bg-emerald-100 text-emerald-700" };
  }
  if (kind === "booking_cancelled") {
    return { icon: CalendarX, iconWrap: "bg-rose-100 text-rose-700" };
  }
  if (kind === "booking_no_show") {
    return { icon: AlertTriangle, iconWrap: "bg-amber-100 text-amber-700" };
  }
  return { icon: Bell, iconWrap: "bg-slate-100 text-slate-600" };
}

type Group = { label: string; items: NotificationRecord[] };

function groupByDate(items: NotificationRecord[]): Group[] {
  const today: NotificationRecord[] = [];
  const yesterday: NotificationRecord[] = [];
  const earlier: NotificationRecord[] = [];

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  for (const n of items) {
    const t = new Date(n.created_at).getTime();
    if (t >= startOfToday.getTime()) today.push(n);
    else if (t >= startOfYesterday.getTime()) yesterday.push(n);
    else earlier.push(n);
  }

  const groups: Group[] = [];
  if (today.length) groups.push({ label: "Today", items: today });
  if (yesterday.length) groups.push({ label: "Yesterday", items: yesterday });
  if (earlier.length) groups.push({ label: "Earlier", items: earlier });
  return groups;
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.round((now - then) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ListSkeleton() {
  return (
    <ul className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      {Array.from({ length: 5 }).map((_, i) => (
        <li
          key={i}
          className="flex items-start gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0"
          aria-hidden="true"
        >
          <div className="h-9 w-9 flex-shrink-0 animate-pulse rounded-full bg-slate-100" />
          <div className="flex-1">
            <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
            <div className="mt-2 h-3 w-5/6 animate-pulse rounded bg-slate-100" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ filter }: { filter: Filter }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
      <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <Bell size={22} />
      </div>
      <p className="text-sm font-medium text-slate-800">
        {filter === "unread" ? "No unread notifications" : "No notifications yet"}
      </p>
      <p className="mt-1 text-sm text-slate-500">
        {filter === "unread"
          ? "You're all caught up."
          : "You'll get a heads up here when there's activity on your bookings."}
      </p>
    </div>
  );
}
