import { formatRelativeTime, type TicketEvent } from "@/lib/support";

/**
 * Admin-only audit sidebar. Renders the per-event log returned by the
 * backend in `Ticket.events`. The parent decides whether to render this
 * (the backend returns `null` for non-admins; render when the array is
 * truthy).
 */
export function TicketEventList({ events }: { events: TicketEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-xs text-slate-500">No events recorded yet.</p>
    );
  }
  return (
    <ol className="space-y-3">
      {events.map((e) => {
        const actor = e.actor?.display_name || e.actor?.email || "System";
        return (
          <li key={e.id} className="text-xs">
            <div className="font-medium text-slate-800">
              {humanEventType(e.event_type)}
            </div>
            <div className="text-slate-500">
              by <span className="text-slate-700">{actor}</span> ·{" "}
              <time
                dateTime={e.created_at}
                title={new Date(e.created_at).toLocaleString()}
              >
                {formatRelativeTime(e.created_at)}
              </time>
            </div>
            <EventPayload payload={e.payload} />
          </li>
        );
      })}
    </ol>
  );
}

const EVENT_LABEL: Record<string, string> = {
  created: "Ticket created",
  message_added: "Message added",
  attachment_added: "Attachment added",
  status_changed: "Status changed",
  priority_changed: "Priority changed",
  assigned: "Assignment changed",
};

function humanEventType(t: string): string {
  return EVENT_LABEL[t] ?? t.replace(/_/g, " ");
}

function EventPayload({ payload }: { payload: Record<string, unknown> }) {
  if (!payload || Object.keys(payload).length === 0) return null;
  // Render a couple of common shapes nicely; fall back to a small key:value list.
  const fromTo =
    payload.from !== undefined && payload.to !== undefined
      ? `${String(payload.from)} → ${String(payload.to)}`
      : null;
  if (fromTo) {
    return (
      <div className="mt-0.5 text-[11px] text-slate-500">{fromTo}</div>
    );
  }
  const fromId = payload.from_id;
  const toId = payload.to_id;
  if (fromId !== undefined && toId !== undefined) {
    return (
      <div className="mt-0.5 text-[11px] text-slate-500">
        {fromId == null ? "Unassigned" : `User #${fromId}`} →{" "}
        {toId == null ? "Unassigned" : `User #${toId}`}
      </div>
    );
  }
  return null;
}
