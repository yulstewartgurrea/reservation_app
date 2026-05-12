"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatApiError } from "@/lib/errors";
import { connectChatRoom, type ChatMessage } from "@/lib/ws";
import { Toast, ToastMessage } from "@/components/Toast";

type Room = {
  id: number;
  customer: number;
  shop: number;
  shop_name: string;
  customer_name: string;
  other_party_name: string;
};

type Message = ChatMessage & { sender_name?: string };

export default function ChatRoomPage() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const roomId = Number(params.roomId);
  const { user, fetchMe } = useAuth();

  const [room, setRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [menuFor, setMenuFor] = useState<number | null>(null);

  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markReadUpTo = useCallback(
    async (msgId: number) => {
      try {
        await api.post(`/chat/rooms/${roomId}/read/`, { message_id: msgId });
      } catch {
        /* non-blocking */
      }
    },
    [roomId]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [roomRes, msgsRes] = await Promise.all([
        api.get(`/chat/rooms/${roomId}/`),
        api.get(`/chat/rooms/${roomId}/messages/`),
      ]);
      setRoom(roomRes.data);
      const rows: Message[] = msgsRes.data.results ?? msgsRes.data;
      setMessages(rows);
      const last = rows[rows.length - 1];
      if (last) markReadUpTo(last.id);
    } catch (err) {
      setToast({ variant: "error", message: formatApiError(err, "Failed to load chat.") });
    } finally {
      setLoading(false);
    }
  }, [roomId, markReadUpTo]);

  useEffect(() => {
    if (!roomId || Number.isNaN(roomId)) return;
    load();
    const socket = connectChatRoom(roomId, (evt) => {
      if (evt.type === "chat.message") {
        setMessages((prev) =>
          prev.some((m) => m.id === evt.message.id) ? prev : [...prev, evt.message]
        );
        if (evt.message.sender_id !== user?.id) {
          markReadUpTo(evt.message.id);
        }
      } else if (evt.type === "chat.message_edited") {
        setMessages((prev) =>
          prev.map((m) => (m.id === evt.message.id ? { ...m, ...evt.message } : m))
        );
      }
      // chat.read_state could be used for read-receipts UI; not displayed in v1.
    });
    return () => socket?.close();
  }, [roomId, load, markReadUpTo, user?.id]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      const { data } = await api.post(`/chat/rooms/${roomId}/messages/`, { body: input });
      setMessages((prev) =>
        prev.some((m) => m.id === data.id) ? prev : [...prev, data]
      );
      setInput("");
    } catch (err) {
      setToast({ variant: "error", message: formatApiError(err, "Failed to send.") });
    } finally {
      setSending(false);
    }
  }

  function startEdit(m: Message) {
    setEditingId(m.id);
    setEditingBody(m.body);
    setMenuFor(null);
  }

  async function saveEdit() {
    if (editingId == null) return;
    try {
      const { data } = await api.patch(`/chat/messages/${editingId}/`, { body: editingBody });
      setMessages((prev) => prev.map((m) => (m.id === editingId ? { ...m, ...data } : m)));
      setEditingId(null);
      setEditingBody("");
    } catch (err) {
      setToast({ variant: "error", message: formatApiError(err, "Failed to edit.") });
    }
  }

  async function markUnreadHere(m: Message) {
    setMenuFor(null);
    try {
      await api.post(`/chat/rooms/${roomId}/unread/`, { message_id: m.id });
      setToast({ variant: "success", message: "Marked as unread from this message." });
      router.push("/chat");
    } catch (err) {
      setToast({ variant: "error", message: formatApiError(err, "Failed to mark unread.") });
    }
  }

  if (!user) {
    return (
      <p className="rounded-md border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
        Please sign in to view this chat.
      </p>
    );
  }

  return (
    <div className="flex h-[calc(100vh-12rem)] flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="min-w-0">
          <Link href="/chat" className="text-xs text-slate-500 hover:underline">
            ← All chats
          </Link>
          <h1 className="truncate text-lg font-semibold">
            {room?.other_party_name ?? "Chat"}
          </h1>
        </div>
      </header>

      <div
        ref={listRef}
        className="flex-1 space-y-2 overflow-y-auto py-4"
        onClick={() => setMenuFor(null)}
      >
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            No messages yet. Say hello.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_id === user.id;
            const isEditing = editingId === m.id;
            return (
              <div
                key={m.id}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`relative max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                    mine
                      ? "bg-brand-600 text-white"
                      : "border border-slate-200 bg-white text-slate-900"
                  }`}
                >
                  {isEditing ? (
                    <div className="space-y-2">
                      <textarea
                        value={editingBody}
                        onChange={(e) => setEditingBody(e.target.value)}
                        rows={2}
                        className="w-full resize-none rounded border border-slate-300 px-2 py-1 text-sm text-slate-900"
                        autoFocus
                      />
                      <div className="flex justify-end gap-2 text-xs">
                        <button
                          onClick={() => {
                            setEditingId(null);
                            setEditingBody("");
                          }}
                          className="rounded px-2 py-1 hover:bg-black/10"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={saveEdit}
                          disabled={!editingBody.trim()}
                          className="rounded bg-white px-2 py-1 text-brand-700 disabled:opacity-50"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      <div className="mt-1 flex items-center gap-1 text-[10px] opacity-80">
                        <span>
                          {new Date(m.created_at).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                        {m.edited_at && <span>· edited</span>}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuFor(menuFor === m.id ? null : m.id);
                        }}
                        aria-label="Message actions"
                        className={`absolute -top-2 ${
                          mine ? "left-[-22px]" : "right-[-22px]"
                        } rounded-full bg-white/90 px-1.5 py-0.5 text-xs text-slate-700 shadow opacity-0 group-hover:opacity-100 ${
                          menuFor === m.id ? "opacity-100" : ""
                        }`}
                      >
                        ⋯
                      </button>
                      {menuFor === m.id && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className={`absolute z-10 mt-1 w-44 rounded-md border border-slate-200 bg-white text-left text-sm text-slate-700 shadow-lg ${
                            mine ? "right-0 top-full" : "left-0 top-full"
                          }`}
                        >
                          {mine && (
                            <button
                              onClick={() => startEdit(m)}
                              className="block w-full px-3 py-2 text-left hover:bg-slate-50"
                            >
                              Edit message
                            </button>
                          )}
                          <button
                            onClick={() => markUnreadHere(m)}
                            className="block w-full px-3 py-2 text-left hover:bg-slate-50"
                          >
                            Mark as unread from here
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <form
        onSubmit={send}
        className="flex items-center gap-2 border-t border-slate-200 pt-3"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Write a message…"
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Send
        </button>
      </form>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
