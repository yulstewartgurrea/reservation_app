export type NotificationRecord = {
  id: number;
  kind: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export type UserRole = "admin" | "shop_owner" | "customer" | undefined;

export function notificationHref(
  n: Pick<NotificationRecord, "kind" | "payload">,
  role: UserRole,
): string | null {
  const p = n.payload ?? {};
  const reservationId = typeof p.reservation_id === "number" ? p.reservation_id : null;
  const shopId = typeof p.shop_id === "number" ? p.shop_id : null;
  const roomId = typeof p.room_id === "number" ? p.room_id : null;

  if (n.kind === "chat.new_message" && roomId !== null) {
    return `/chat/${roomId}`;
  }
  if (n.kind.startsWith("booking_")) {
    if (role === "shop_owner" && shopId !== null) {
      return reservationId !== null
        ? `/my-shops/${shopId}/reservations?focus=${reservationId}`
        : `/my-shops/${shopId}/reservations`;
    }
    if (reservationId !== null) {
      return `/reservations?focus=${reservationId}`;
    }
  }
  if (n.kind === "reminder" && shopId !== null) {
    return `/shops/${shopId}`;
  }
  return null;
}
