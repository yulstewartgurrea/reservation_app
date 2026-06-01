"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { connectNotifications } from "@/lib/ws";

export function ChatBadge() {
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/chat/unread-count/");
      setUnread(data.unread ?? 0);
    } catch {
      /* not signed in */
    }
  }, []);

  useEffect(() => {
    load();
    const socket = connectNotifications((n) => {
      if (n.kind === "chat.new_message") {
        // Cheap: just bump locally and reconcile from the server.
        setUnread((u) => u + 1);
        load();
      }
    });
    return () => socket?.close();
  }, [load]);

  return (
    <Link
      href="/chat"
      onClick={() => setUnread(0)}
      className="relative rounded p-2 hover:bg-slate-100"
      aria-label="Chats"
    >
      <span aria-hidden>💬</span>
      {unread > 0 && (
        <span className="absolute -right-1 -top-1 min-w-[1.1rem] rounded-full bg-red-600 px-1.5 text-center text-xs font-medium text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
