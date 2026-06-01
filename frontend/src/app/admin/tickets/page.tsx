"use client";

/**
 * Admin support queue.
 *
 * Lists every ticket the requester can see, filterable by status / category
 * / priority / assignee / free-text. Filter state stays local — small enough
 * not to need URL persistence in v1.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LifeBuoy } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatApiError } from "@/lib/errors";
import {
  formatRelativeTime,
  listAdminTickets,
  type AdminTicketFilters,
} from "@/lib/support";
import { PageHeader } from "@/components/PageHeader";
import { TicketCategoryBadge } from "@/components/support/TicketCategoryBadge";
import { TicketFilters } from "@/components/support/TicketFilters";
import { TicketPriorityPill } from "@/components/support/TicketPriorityPill";
import { TicketStatusPill } from "@/components/support/TicketStatusPill";

export default function AdminTicketsPage() {
  const { user, fetchMe } = useAuth();

  useEffect(() => {
    fetchMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Default to the most useful queue: open + unassigned.
  const [filters, setFilters] = useState<AdminTicketFilters>({
    status: "open",
    assigned_to: "",
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["tickets", "admin", filters],
    queryFn: () => listAdminTickets(filters),
    enabled: user?.role === "admin",
  });

  const openCount = useMemo(() => {
    if (!data) return 0;
    return data.results.filter((t) => t.status === "open").length;
  }, [data]);

  if (user && user.role !== "admin") {
    return (
      <div className="py-10 text-center text-sm text-slate-500">
        Admin access required.
      </div>
    );
  }

  return (
    <div className="space-y-6 py-4">
      <PageHeader
        title="Support tickets"
        icon={LifeBuoy}
        description={
          data
            ? `${data.count} ticket${data.count === 1 ? "" : "s"} matching filters · ${openCount} open shown`
            : "Customer & shop-owner support queue."
        }
      />

      <TicketFilters
        value={filters}
        onChange={setFilters}
        onClear={() => setFilters({})}
      />

      {isLoading ? (
        <SkeletonList />
      ) : error ? (
        <p className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {formatApiError(error, "Couldn't load tickets.")}
        </p>
      ) : !data || data.results.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-slate-700">No tickets match these filters.</p>
          <p className="mt-1 text-sm text-slate-500">
            Try clearing filters or widening the search.
          </p>
        </div>
      ) : (
        <>
          {/* Mobile: card list */}
          <ul className="space-y-3 lg:hidden">
            {data.results.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/admin/tickets/${t.id}`}
                  className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-brand-300 hover:bg-slate-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">
                      {t.subject}
                    </h2>
                    <time
                      className="flex-shrink-0 text-xs text-slate-500"
                      dateTime={t.last_message_at ?? t.created_at}
                    >
                      {formatRelativeTime(t.last_message_at ?? t.created_at)}
                    </time>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <TicketStatusPill status={t.status} />
                    <TicketPriorityPill priority={t.priority} />
                    <TicketCategoryBadge category={t.category} />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    From{" "}
                    <span className="text-slate-700">
                      {t.submitter?.display_name ?? "—"}
                    </span>{" "}
                    · Assigned to{" "}
                    <span className="text-slate-700">
                      {t.assigned_to?.display_name ?? "Unassigned"}
                    </span>
                  </p>
                </Link>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div className="hidden overflow-x-auto rounded-lg border border-slate-200 bg-white lg:block">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Subject</th>
                  <th className="px-3 py-2">Submitter</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Priority</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Assignee</th>
                  <th className="px-3 py-2">Updated</th>
                </tr>
              </thead>
              <tbody>
                {data.results.map((t) => (
                  <tr
                    key={t.id}
                    className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                    onClick={() => {
                      window.location.href = `/admin/tickets/${t.id}`;
                    }}
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/tickets/${t.id}`}
                        className="font-medium text-slate-900 hover:text-brand-700"
                      >
                        {t.subject}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {t.submitter?.display_name ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <TicketStatusPill status={t.status} />
                    </td>
                    <td className="px-3 py-2">
                      <TicketPriorityPill priority={t.priority} />
                    </td>
                    <td className="px-3 py-2">
                      <TicketCategoryBadge category={t.category} />
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {t.assigned_to?.display_name ?? (
                        <span className="text-slate-400">Unassigned</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      <time
                        dateTime={t.last_message_at ?? t.created_at}
                        title={new Date(
                          t.last_message_at ?? t.created_at
                        ).toLocaleString()}
                      >
                        {formatRelativeTime(t.last_message_at ?? t.created_at)}
                      </time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function SkeletonList() {
  return (
    <ul className="space-y-3">
      {[0, 1, 2, 3].map((i) => (
        <li
          key={i}
          className="h-20 animate-pulse rounded-lg border border-slate-200 bg-white"
        />
      ))}
    </ul>
  );
}
