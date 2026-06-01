"use client";

/**
 * Admin-only "Tickets" nav link with an unread/needs-attention badge.
 *
 * Badge counts open tickets that are either assigned to me OR unassigned —
 * the queue most likely to need attention. We fire two cheap count queries
 * (`?status=open&assigned_to=me` and `?status=open&assigned_to=unassigned`)
 * and sum their `count`. TanStack Query caches with a 60s stale time and
 * refetches on focus so the badge feels live without polling.
 */

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { LifeBuoy } from "lucide-react";
import { listAdminTickets } from "@/lib/support";

export function AdminTicketsNavLink() {
  const { data } = useQuery({
    queryKey: ["tickets", "admin", "badge"],
    queryFn: async () => {
      const [mine, unassigned] = await Promise.all([
        listAdminTickets({ status: "open", assigned_to: "me" }),
        listAdminTickets({ status: "open", assigned_to: "unassigned" }),
      ]);
      return (mine.count ?? 0) + (unassigned.count ?? 0);
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const count = data ?? 0;

  return (
    <Link
      href="/admin/tickets"
      aria-label={`Support tickets${count > 0 ? ` (${count} need attention)` : ""}`}
      className="relative inline-flex items-center gap-1 rounded p-2 text-slate-700 hover:bg-slate-100"
    >
      <LifeBuoy size={18} aria-hidden />
      <span className="hidden sm:inline text-sm">Tickets</span>
      {count > 0 && (
        <span className="absolute -right-1 -top-1 min-w-[1.1rem] rounded-full bg-red-600 px-1.5 text-center text-xs font-medium text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
