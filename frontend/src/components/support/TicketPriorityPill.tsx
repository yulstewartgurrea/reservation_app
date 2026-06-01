import { PRIORITY_LABEL, type TicketPriority } from "@/lib/support";

const PRIORITY_CLASS: Record<TicketPriority, string> = {
  low: "bg-slate-100 text-slate-600",
  normal: "bg-slate-200 text-slate-700",
  high: "bg-orange-100 text-orange-800",
  urgent: "bg-red-100 text-red-800",
};

export function TicketPriorityPill({
  priority,
}: {
  priority: TicketPriority;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${PRIORITY_CLASS[priority]}`}
    >
      {PRIORITY_LABEL[priority]}
    </span>
  );
}
