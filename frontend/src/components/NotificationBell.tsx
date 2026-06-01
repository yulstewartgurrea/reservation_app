"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { notificationHref, type NotificationRecord } from "@/lib/notifications";
import { connectNotifications, WsNotification } from "@/lib/ws";

const DROPDOWN_LIMIT = 5;

export function NotificationBell() {
  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [open, setOpen] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    load();
    const socket = connectNotifications((n: WsNotification) => {
      // The notifications socket is shared with chat control signals
      // (chat.typing, presence.update) that ride on the same channel with
      // empty title/body. Skip those — they shouldn't render as rows.
      if (!n.title) return;
      setItems((prev) => [
        {
          id: Date.now(),
          kind: n.kind,
          title: n.title,
          body: n.body,
          payload: n.payload ?? {},
          read_at: null,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
    });
    return () => socket?.close();
  }, []);

  async function load() {
    try {
      const { data } = await api.get("/notifications/");
      setItems(data.results ?? data);
    } catch {
      /* not signed in */
    }
  }

  async function markAllRead() {
    await api.post("/notifications/mark-all-read/");
    setItems((prev) => prev.map((n) => ({ ...n, read_at: new Date().toISOString() })));
  }

  const visibleItems = items.filter((n) => n.title);
  const unread = visibleItems.filter((n) => !n.read_at).length;

  function handleToggle() {
    setOpen((prev) => {
      const next = !prev;
      if (next && unread > 0) {
        markAllRead().catch(() => {
          /* badge will reconcile on next load */
        });
      }
      return next;
    });
  }

  return (
    <div className="relative">
      <button
        onClick={handleToggle}
        className="relative rounded p-2 hover:bg-slate-100"
        aria-label="Notifications"
      >
        <span aria-hidden>🔔</span>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1.5 text-xs text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 max-w-[90vw] rounded-md border border-slate-200 bg-white shadow-lg">
          <div className="border-b px-3 py-2">
            <span className="text-sm font-semibold">Notifications</span>
          </div>
          <ul className="max-h-80 overflow-auto">
            {visibleItems.length === 0 ? (
              <li className="px-3 py-4 text-sm text-slate-500">Nothing yet.</li>
            ) : (
              visibleItems.slice(0, DROPDOWN_LIMIT).map((n) => {
                const href = notificationHref(n, user?.role);
                const rowClass = `block border-b px-3 py-2 text-sm ${
                  n.read_at ? "" : "bg-brand-50"
                } ${href ? "hover:bg-slate-100" : ""}`;
                const inner = (
                  <>
                    <div className="font-medium">{n.title}</div>
                    {n.body && <div className="text-slate-600">{n.body}</div>}
                  </>
                );
                return (
                  <li key={n.id}>
                    {href ? (
                      <Link
                        href={href}
                        className={rowClass}
                        onClick={() => setOpen(false)}
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div className={rowClass}>{inner}</div>
                    )}
                  </li>
                );
              })
            )}
          </ul>
          <div className="border-t px-3 py-2 text-center">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline"
            >
              See all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
