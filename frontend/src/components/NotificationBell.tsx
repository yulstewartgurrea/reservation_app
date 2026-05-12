"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { connectNotifications, WsNotification } from "@/lib/ws";

type Notification = {
  id: number;
  kind: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

export function NotificationBell() {
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    load();
    const socket = connectNotifications((n: WsNotification) => {
      setItems((prev) => [
        {
          id: Date.now(),
          kind: n.kind,
          title: n.title,
          body: n.body,
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

  const unread = items.filter((n) => !n.read_at).length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
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
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs text-brand-600">
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-80 overflow-auto">
            {items.length === 0 ? (
              <li className="px-3 py-4 text-sm text-slate-500">Nothing yet.</li>
            ) : (
              items.slice(0, 20).map((n) => (
                <li
                  key={n.id}
                  className={`border-b px-3 py-2 text-sm ${n.read_at ? "" : "bg-brand-50"}`}
                >
                  <div className="font-medium">{n.title}</div>
                  {n.body && <div className="text-slate-600">{n.body}</div>}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
