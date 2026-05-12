"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatApiError } from "@/lib/errors";
import { connectNotifications } from "@/lib/ws";

type ChatRoom = {
  id: number;
  customer: number;
  shop: number;
  shop_name: string;
  customer_name: string;
  other_party_name: string;
  unread_count: number;
  last_message_at: string | null;
  last_message: {
    id: number;
    body: string;
    sender_id: number;
    created_at: string;
    edited_at: string | null;
  } | null;
};

export default function ChatListPage() {
  const { user, fetchMe } = useAuth();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMe();
    load();
    const socket = connectNotifications((n) => {
      if (n.kind === "chat.new_message") {
        // A new message arrived in some room — re-fetch list so unread counts/preview update
        load();
      }
    });
    return () => socket?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    try {
      const { data } = await api.get("/chat/rooms/");
      setRooms(data.results ?? data);
    } catch (err) {
      setError(formatApiError(err, "Failed to load chats."));
    } finally {
      setLoading(false);
    }
  }

  if (!user) {
    return (
      <p className="rounded-md border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
        Please sign in to view your chats.
      </p>
    );
  }

  return (
    <div className="space-y-4 py-4">
      <header>
        <h1 className="text-2xl font-semibold">Chats</h1>
        <p className="mt-1 text-sm text-slate-600">
          {user.role === "shop_owner"
            ? "Conversations from your customers."
            : "Your conversations with shops."}
        </p>
      </header>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : error ? (
        <p className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </p>
      ) : rooms.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          No chats yet.{" "}
          {user.role === "customer" && (
            <Link href="/shops" className="text-brand-600 underline">
              Find a shop
            </Link>
          )}
        </p>
      ) : (
        <ul className="space-y-2">
          {rooms.map((r) => (
            <li key={r.id}>
              <Link
                href={`/chat/${r.id}`}
                className="block rounded-md border border-slate-200 bg-white px-4 py-3 hover:bg-slate-50"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-slate-900">
                        {r.other_party_name}
                      </span>
                      {r.unread_count > 0 && (
                        <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-brand-600 px-1.5 text-xs font-medium text-white">
                          {r.unread_count}
                        </span>
                      )}
                    </div>
                    {r.last_message ? (
                      <p className="mt-0.5 truncate text-sm text-slate-600">
                        {r.last_message.body}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-sm italic text-slate-400">No messages yet</p>
                    )}
                  </div>
                  {r.last_message_at && (
                    <span className="shrink-0 text-xs text-slate-500">
                      {new Date(r.last_message_at).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
