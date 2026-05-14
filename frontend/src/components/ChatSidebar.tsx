"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, Search, ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatApiError } from "@/lib/errors";
import { connectNotifications } from "@/lib/ws";
import { Avatar } from "@/components/Avatar";

type ChatRoom = {
  id: number;
  customer: number;
  shop: number;
  shop_name: string;
  customer_name: string;
  other_party_name: string;
  other_party_id: number | null;
  other_party_online: boolean;
  other_party_last_seen_at: string | null;
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

// How long a "typing" hint sticks around in the sidebar before auto-clearing,
// in case the "stopped typing" event never arrives (tab closed, etc.).
const TYPING_PREVIEW_MS = 4000;

function formatPreviewTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.floor((now.getTime() - d.getTime()) / dayMs);
  if (diffDays < 7) {
    return d.toLocaleDateString([], { weekday: "short" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function ChatSidebar() {
  const router = useRouter();
  const params = useParams<{ roomId?: string }>();
  const activeId = params?.roomId ? Number(params.roomId) : null;
  const { user } = useAuth();

  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // Map of room_id -> true while the other party is typing.
  const [typingByRoom, setTypingByRoom] = useState<Record<number, boolean>>({});
  const typingTimersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    load();
    const socket = connectNotifications((n) => {
      if (n.kind === "chat.new_message") {
        load();
        const roomId = (n.payload as { room_id?: number })?.room_id;
        if (roomId) {
          // A new message ends typing for that room.
          setTypingByRoom((prev) => (prev[roomId] ? { ...prev, [roomId]: false } : prev));
          const t = typingTimersRef.current[roomId];
          if (t) {
            clearTimeout(t);
            delete typingTimersRef.current[roomId];
          }
        }
      } else if (n.kind === "chat.typing") {
        const payload = n.payload as {
          room_id?: number;
          user_id?: number;
          is_typing?: boolean;
        };
        const roomId = payload?.room_id;
        if (!roomId) return;
        setTypingByRoom((prev) => ({ ...prev, [roomId]: Boolean(payload.is_typing) }));
        const existing = typingTimersRef.current[roomId];
        if (existing) clearTimeout(existing);
        if (payload.is_typing) {
          typingTimersRef.current[roomId] = setTimeout(() => {
            setTypingByRoom((prev) => ({ ...prev, [roomId]: false }));
            delete typingTimersRef.current[roomId];
          }, TYPING_PREVIEW_MS);
        } else {
          delete typingTimersRef.current[roomId];
        }
      } else if (n.kind === "presence.update") {
        const payload = n.payload as {
          user_id?: number;
          is_online?: boolean;
          last_seen_at?: string | null;
        };
        if (!payload?.user_id) return;
        setRooms((prev) =>
          prev.map((r) =>
            r.other_party_id === payload.user_id
              ? {
                  ...r,
                  other_party_online: Boolean(payload.is_online),
                  other_party_last_seen_at:
                    payload.last_seen_at !== undefined
                      ? payload.last_seen_at ?? null
                      : r.other_party_last_seen_at,
                }
              : r
          )
        );
      }
    });
    return () => {
      socket?.close();
      Object.values(typingTimersRef.current).forEach((t) => clearTimeout(t));
      typingTimersRef.current = {};
    };
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

  const sorted = useMemo(() => {
    const list = [...rooms].sort((a, b) => {
      const ta = a.last_message_at ? Date.parse(a.last_message_at) : 0;
      const tb = b.last_message_at ? Date.parse(b.last_message_at) : 0;
      return tb - ta;
    });
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (r) =>
        r.other_party_name.toLowerCase().includes(q) ||
        (r.last_message?.body?.toLowerCase().includes(q) ?? false)
    );
  }, [rooms, query]);

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50"
            aria-label="Go back"
          >
            <ArrowLeft size={14} />
            Back
          </button>
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <MessageSquare size={20} className="text-brand-600" />
            Chats
          </h2>
        </div>
        <div className="relative">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations"
            className="w-full rounded-full border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm placeholder-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="p-4 text-sm text-slate-500">Loading…</p>
        ) : error ? (
          <p className="m-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        ) : sorted.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-slate-500">
              {rooms.length === 0 ? "No chats yet." : "No matches."}
            </p>
            {rooms.length === 0 && user?.role === "customer" && (
              <Link
                href="/shops"
                className="mt-2 inline-block text-sm text-brand-600 underline"
              >
                Find a shop
              </Link>
            )}
          </div>
        ) : (
          <ul>
            {sorted.map((r) => {
              const isActive = r.id === activeId;
              const isMine =
                r.last_message && user && r.last_message.sender_id === user.id;
              const isTyping = Boolean(typingByRoom[r.id]);
              return (
                <li key={r.id}>
                  <Link
                    href={`/chat/${r.id}`}
                    className={`flex items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors ${
                      isActive ? "bg-brand-50" : "hover:bg-slate-50"
                    }`}
                  >
                    <span className="relative">
                      <Avatar name={r.other_party_name} size="md" />
                      {r.other_party_online && (
                        <span
                          aria-label="Online"
                          className="absolute -bottom-0.5 -right-0.5 inline-block h-3 w-3 rounded-full border-2 border-white bg-emerald-500"
                        />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`truncate font-semibold ${
                            r.unread_count > 0 ? "text-slate-900" : "text-slate-800"
                          }`}
                        >
                          {r.other_party_name}
                        </span>
                        <span
                          className={`shrink-0 text-xs ${
                            r.unread_count > 0
                              ? "font-semibold text-brand-600"
                              : "text-slate-400"
                          }`}
                        >
                          {formatPreviewTime(r.last_message_at)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        {isTyping ? (
                          <p className="truncate text-sm font-medium text-brand-600">
                            typing…
                          </p>
                        ) : r.last_message ? (
                          <p
                            className={`truncate text-sm ${
                              r.unread_count > 0 && !isMine
                                ? "font-medium text-slate-700"
                                : "text-slate-500"
                            }`}
                          >
                            {isMine && <span className="text-slate-400">You: </span>}
                            {r.last_message.body}
                          </p>
                        ) : (
                          <p className="truncate text-sm italic text-slate-400">
                            No messages yet
                          </p>
                        )}
                        {r.unread_count > 0 && (
                          <span className="inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold text-white">
                            {r.unread_count > 99 ? "99+" : r.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
