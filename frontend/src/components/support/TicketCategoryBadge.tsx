import { CATEGORY_LABEL, type TicketCategory } from "@/lib/support";

export function TicketCategoryBadge({
  category,
}: {
  category: TicketCategory;
}) {
  return (
    <span className="inline-flex items-center rounded border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-600">
      {CATEGORY_LABEL[category]}
    </span>
  );
}
