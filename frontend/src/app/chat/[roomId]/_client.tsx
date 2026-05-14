"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, MoreVertical, Paperclip, Send, Smile, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatApiError } from "@/lib/errors";
import { connectChatRoom, connectNotifications, sendTyping, type ChatMessage } from "@/lib/ws";
import { Avatar } from "@/components/Avatar";
import { ChatAttachment } from "@/components/ChatAttachment";
import { EmojiPicker } from "@/components/EmojiPicker";
import { Linkify } from "@/components/Linkify";
import { Toast, ToastMessage } from "@/components/Toast";

type Room = {
  id: number;
  customer: number;
  shop: number;
  shop_name: string;
  customer_name: string;
  other_party_name: string;
  other_party_id: number | null;
  other_party_online: boolean;
  other_party_last_seen_at: string | null;
};

// How long after the last keystroke we keep firing "typing".
const TYPING_IDLE_MS = 3000;

function formatLastSeen(iso: string | null): string {
  if (!iso) return "Offline";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "Last seen just now";
  if (min < 60) return `Last seen ${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `Last seen ${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `Last seen ${day}d ago`;
  return `Last seen ${d.toLocaleDateString([], { month: "short", day: "numeric" })}`;
}

type Message = ChatMessage & { sender_name?: string };

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "long" });
  return d.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
}

function sameDay(a: string, b: string): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return (
    x.getFullYear() === y.getFullYear() &&
    x.getMonth() === y.getMonth() &&
    x.getDate() === y.getDate()
  );
}

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
  const [otherTyping, setOtherTyping] = useState(false);
  const [otherOnline, setOtherOnline] = useState(false);
  const [otherLastSeen, setOtherLastSeen] = useState<string | null>(null);
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [pickedPreview, setPickedPreview] = useState<string | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const otherTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  // 25MB ceiling, matched against the backend limit.
  const MAX_FILE_BYTES = 25 * 1024 * 1024;

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
      setOtherOnline(Boolean(roomRes.data?.other_party_online));
      setOtherLastSeen(roomRes.data?.other_party_last_seen_at ?? null);
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
          // A new message implicitly ends the typing indicator.
          setOtherTyping(false);
          if (otherTypingTimerRef.current) {
            clearTimeout(otherTypingTimerRef.current);
            otherTypingTimerRef.current = null;
          }
        }
      } else if (evt.type === "chat.message_edited") {
        setMessages((prev) =>
          prev.map((m) => (m.id === evt.message.id ? { ...m, ...evt.message } : m))
        );
      } else if (evt.type === "chat.typing") {
        if (evt.user_id === user?.id) return; // ignore echo of our own typing
        setOtherTyping(evt.is_typing);
        if (otherTypingTimerRef.current) {
          clearTimeout(otherTypingTimerRef.current);
          otherTypingTimerRef.current = null;
        }
        if (evt.is_typing) {
          // Auto-clear in case the "stopped" event never arrives (e.g. tab closed).
          otherTypingTimerRef.current = setTimeout(() => setOtherTyping(false), TYPING_IDLE_MS + 1000);
        }
      }
    });
    socketRef.current = socket;
    return () => {
      socket?.close();
      socketRef.current = null;
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (otherTypingTimerRef.current) clearTimeout(otherTypingTimerRef.current);
    };
  }, [roomId, load, markReadUpTo, user?.id]);

  // Presence updates for the other party arrive on the notifications socket,
  // not the room socket — we subscribe here too so the header dot stays live.
  useEffect(() => {
    const otherId = room?.other_party_id ?? null;
    if (!otherId) return;
    const sock = connectNotifications((n) => {
      if (n.kind === "presence.update") {
        const payload = n.payload as {
          user_id?: number;
          is_online?: boolean;
          last_seen_at?: string | null;
        };
        if (payload?.user_id === otherId) {
          setOtherOnline(Boolean(payload.is_online));
          if (payload.last_seen_at !== undefined) {
            setOtherLastSeen(payload.last_seen_at ?? null);
          }
        }
      }
    });
    return () => sock?.close();
  }, [room?.other_party_id]);

  const emitTyping = useCallback(() => {
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      sendTyping(socketRef.current, true);
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      isTypingRef.current = false;
      sendTyping(socketRef.current, false);
    }, TYPING_IDLE_MS);
  }, []);

  const stopTyping = useCallback(() => {
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    if (isTypingRef.current) {
      isTypingRef.current = false;
      sendTyping(socketRef.current, false);
    }
  }, []);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length, otherTyping]);

  function clearPickedFile() {
    setPickedFile(null);
    if (pickedPreview) URL.revokeObjectURL(pickedPreview);
    setPickedPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setToast({ variant: "error", message: "File is too large (25MB max)." });
      e.target.value = "";
      return;
    }
    setPickedFile(file);
    if (file.type.startsWith("image/") || file.type.startsWith("video/")) {
      setPickedPreview(URL.createObjectURL(file));
    } else {
      setPickedPreview(null);
    }
  }

  function insertEmoji(emoji: string) {
    const el = inputRef.current;
    if (!el) {
      setInput((prev) => prev + emoji);
      return;
    }
    const start = el.selectionStart ?? input.length;
    const end = el.selectionEnd ?? input.length;
    const next = input.slice(0, start) + emoji + input.slice(end);
    setInput(next);
    // Restore caret position after React updates the value.
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + emoji.length;
      el.setSelectionRange(pos, pos);
      autosize(el);
    });
  }

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const body = input.trim();
    if (sending) return;
    if (!body && !pickedFile) return;
    setSending(true);
    try {
      let data;
      if (pickedFile) {
        const fd = new FormData();
        if (body) fd.append("body", body);
        fd.append("attachment", pickedFile);
        const res = await api.post(`/chat/rooms/${roomId}/messages/`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        data = res.data;
      } else {
        const res = await api.post(`/chat/rooms/${roomId}/messages/`, { body });
        data = res.data;
      }
      setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data]));
      setInput("");
      clearPickedFile();
      stopTyping();
      if (inputRef.current) inputRef.current.style.height = "auto";
    } catch (err) {
      setToast({ variant: "error", message: formatApiError(err, "Failed to send.") });
    } finally {
      setSending(false);
    }
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function autosize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
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

  const grouped = useMemo(() => {
    const out: Array<{ key: string; type: "day" | "msg"; msg?: Message; label?: string }> = [];
    let prev: Message | null = null;
    for (const m of messages) {
      if (!prev || !sameDay(prev.created_at, m.created_at)) {
        out.push({ key: `d-${m.id}`, type: "day", label: dayLabel(m.created_at) });
      }
      out.push({ key: `m-${m.id}`, type: "msg", msg: m });
      prev = m;
    }
    return out;
  }, [messages]);

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="rounded-md border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          Please sign in to view this chat.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <Link
          href="/chat"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 md:hidden"
          aria-label="Back to chats"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="relative">
          <Avatar name={room?.other_party_name ?? "?"} size="md" />
          {otherOnline && (
            <span
              aria-label="Online"
              title="Online"
              className="absolute -bottom-0.5 -right-0.5 inline-block h-3 w-3 rounded-full border-2 border-white bg-emerald-500"
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold text-slate-900">
            {room?.other_party_name ?? "Chat"}
          </h1>
          {otherTyping ? (
            <p className="flex items-center gap-1.5 truncate text-xs font-medium text-brand-600">
              typing
              <span className="flex items-end gap-0.5" aria-hidden>
                <span className="chat-typing-dot" />
                <span className="chat-typing-dot" />
                <span className="chat-typing-dot" />
              </span>
            </p>
          ) : otherOnline ? (
            <p className="truncate text-xs text-emerald-600">Online</p>
          ) : (
            <p className="truncate text-xs text-slate-500">
              {formatLastSeen(otherLastSeen)}
            </p>
          )}
        </div>
      </header>

      <div
        ref={listRef}
        className="flex-1 space-y-1 overflow-y-auto bg-slate-50 px-4 py-4"
        onClick={() => setMenuFor(null)}
      >
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="rounded-md border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
              No messages yet. Say hello.
            </p>
          </div>
        ) : (
          grouped.map((item) => {
            if (item.type === "day") {
              return (
                <div key={item.key} className="my-3 flex justify-center">
                  <span className="rounded-full bg-slate-200/70 px-3 py-1 text-[11px] font-medium text-slate-600">
                    {item.label}
                  </span>
                </div>
              );
            }
            const m = item.msg!;
            const mine = m.sender_id === user.id;
            const isEditing = editingId === m.id;
            return (
              <div
                key={item.key}
                className={`group flex items-end gap-2 ${
                  mine ? "justify-end" : "justify-start"
                }`}
              >
                {!mine && (
                  <Avatar name={room?.other_party_name ?? "?"} size="sm" className="mb-1" />
                )}
                <div className={`relative max-w-[75%] ${mine ? "items-end" : "items-start"}`}>
                  <div
                    className={`relative rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
                      mine
                        ? "rounded-br-sm bg-brand-600 text-white"
                        : "rounded-bl-sm bg-white text-slate-900"
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
                        {m.attachment_url && (
                          <div className={m.body ? "mb-2" : ""}>
                            <ChatAttachment
                              url={m.attachment_url}
                              kind={m.attachment_kind}
                              name={m.attachment_name}
                              size={m.attachment_size}
                              mine={mine}
                            />
                          </div>
                        )}
                        {m.body && (
                          <Linkify
                            text={m.body}
                            className="block whitespace-pre-wrap break-words"
                          />
                        )}
                        <div
                          className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
                            mine ? "text-white/80" : "text-slate-400"
                          }`}
                        >
                          <span>
                            {new Date(m.created_at).toLocaleTimeString([], {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </span>
                          {m.edited_at && <span>· edited</span>}
                        </div>
                      </>
                    )}
                  </div>

                  {!isEditing && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuFor(menuFor === m.id ? null : m.id);
                      }}
                      aria-label="Message actions"
                      className={`absolute top-1 ${
                        mine ? "-left-7" : "-right-7"
                      } inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-slate-500 opacity-0 shadow-sm transition-opacity hover:bg-slate-100 group-hover:opacity-100 ${
                        menuFor === m.id ? "opacity-100" : ""
                      }`}
                    >
                      <MoreVertical size={14} />
                    </button>
                  )}
                  {menuFor === m.id && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className={`absolute z-10 mt-1 w-48 rounded-md border border-slate-200 bg-white text-left text-sm text-slate-700 shadow-lg ${
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
                </div>
              </div>
            );
          })
        )}
        {otherTyping && (
          <div className="flex items-end gap-2">
            <Avatar name={room?.other_party_name ?? "?"} size="sm" className="mb-1" />
            <div className="rounded-2xl rounded-bl-sm bg-white px-3.5 py-2.5 text-slate-500 shadow-sm">
              <span className="sr-only">{room?.other_party_name ?? "Someone"} is typing</span>
              <span className="flex items-end gap-1" aria-hidden>
                <span className="chat-typing-dot" />
                <span className="chat-typing-dot" />
                <span className="chat-typing-dot" />
              </span>
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={send}
        className="border-t border-slate-200 bg-white px-4 py-3"
      >
        {pickedFile && (
          <div className="mb-2 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2">
            {pickedPreview && pickedFile.type.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={pickedPreview}
                alt={pickedFile.name}
                className="h-14 w-14 rounded object-cover"
              />
            ) : pickedPreview && pickedFile.type.startsWith("video/") ? (
              <video
                src={pickedPreview}
                className="h-14 w-14 rounded bg-black object-cover"
                muted
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded bg-slate-200 text-xs font-medium text-slate-600">
                FILE
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800">
                {pickedFile.name}
              </p>
              <p className="text-xs text-slate-500">
                {(pickedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            <button
              type="button"
              onClick={clearPickedFile}
              aria-label="Remove attachment"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="relative flex items-end gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowEmoji((v) => !v)}
              aria-label="Insert emoji"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
            >
              <Smile size={20} />
            </button>
            {showEmoji && (
              <EmojiPicker
                onPick={(e) => insertEmoji(e)}
                onClose={() => setShowEmoji(false)}
              />
            )}
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach file"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
          >
            <Paperclip size={20} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*,application/pdf,application/zip,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            className="hidden"
            onChange={onPickFile}
          />
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              const next = e.target.value;
              setInput(next);
              autosize(e.currentTarget);
              if (next.trim()) emitTyping();
              else stopTyping();
            }}
            onBlur={stopTyping}
            onKeyDown={onInputKeyDown}
            placeholder="Type your message…"
            rows={1}
            className="max-h-36 flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-brand-500 focus:bg-white focus:outline-none"
          />
          <button
            type="submit"
            disabled={(!input.trim() && !pickedFile) || sending}
            aria-label="Send message"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
          >
            <Send size={18} />
          </button>
        </div>
      </form>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
