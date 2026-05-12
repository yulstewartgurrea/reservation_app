"use client";

export type WsNotification = {
  kind: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
};

function wsBase(): string | null {
  if (typeof window === "undefined") return null;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  return apiUrl.replace(/^http/, "ws");
}

function wsToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

export function connectNotifications(
  onMessage: (n: WsNotification) => void
): WebSocket | null {
  const base = wsBase();
  const token = wsToken();
  if (!base || !token) return null;

  const socket = new WebSocket(`${base}/ws/notifications/?token=${token}`);

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as WsNotification;
      onMessage(data);
    } catch {
      /* ignore */
    }
  };

  return socket;
}

export type ChatRoomEvent =
  | { type: "chat.message"; message: ChatMessage }
  | { type: "chat.message_edited"; message: ChatMessage }
  | {
      type: "chat.read_state";
      user_id: number;
      last_read_message_id: number | null;
    };

export type ChatMessage = {
  id: number;
  room_id: number;
  sender_id: number;
  body: string;
  created_at: string;
  edited_at: string | null;
};

export function connectChatRoom(
  roomId: number,
  onEvent: (e: ChatRoomEvent) => void
): WebSocket | null {
  const base = wsBase();
  const token = wsToken();
  if (!base || !token) return null;

  const socket = new WebSocket(
    `${base}/ws/chat/rooms/${roomId}/?token=${token}`
  );

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as ChatRoomEvent;
      onEvent(data);
    } catch {
      /* ignore */
    }
  };

  return socket;
}
