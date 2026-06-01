"use client";

/**
 * Customer / shop-owner "My tickets" list.
 *
 * Non-admins only see their own tickets thanks to backend scoping. The
 * admin queue lives at `/admin/tickets`.
 */

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { LifeBuoy, Plus } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatApiError } from "@/lib/errors";
import { formatRelativeTime, listTickets } from "@/lib/support";
import { PageHeader } from "@/components/PageHeader";
import { TicketCategoryBadge } from "@/components/support/TicketCategoryBadge";
import { TicketPriorityPill } from "@/components/support/TicketPriorityPill";
import { TicketStatusPill } from "@/components/support/TicketStatusPill";

export default function MyTicketsPage() {
  const router = useRouter();
  const { user, fetchMe } = useAuth();

  useEffect(() => {
    fetchMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Admins land on the staff queue instead.
  useEffect(() => {
    if (user?.role === "admin") router.replace("/admin/tickets");
  }, [user, router]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["tickets", "mine"],
    queryFn: () => listTickets(),
    enabled: !!user && user.role !== "admin",
  });

  if (!user) {
    return (
      <div className="py-12">
        <p className="rounded-md border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          Please sign in to view your support tickets.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 py-4">
      <PageHeader
        title="Support"
        icon={LifeBuoy}
        description="Get help from our team. We typically reply within 1 business day."
        actions={
          <Link
            href="/support/new"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Plus size={16} />
            New ticket
          </Link>
        }
      />

      {isLoading ? (
        <SkeletonList />
      ) : error ? (
        <p className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {formatApiError(error, "Couldn't load your tickets.")}
        </p>
      ) : !data || data.results.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="space-y-3">
          {data.results.map((t) => (
            <li key={t.id}>
              <Link
                href={`/support/${t.id}`}
                className="block rounded-lg border border-slate-200 bg-white p-4 transition hover:border-brand-300 hover:bg-slate-50"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-sm font-semibold text-slate-900">
                      {t.subject}
                    </h2>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <TicketStatusPill status={t.status} />
                      <TicketPriorityPill priority={t.priority} />
                      <TicketCategoryBadge category={t.category} />
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <div>Updated</div>
                    <div
                      title={
                        t.last_message_at
                          ? new Date(t.last_message_at).toLocaleString()
                          : undefined
                      }
                    >
                      {formatRelativeTime(t.last_message_at ?? t.created_at)}
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
      <LifeBuoy size={28} className="mx-auto mb-2 text-slate-400" />
      <p className="font-medium text-slate-700">No tickets yet</p>
      <p className="mt-1 text-sm text-slate-500">
        Need help? Open a ticket and we'll get back to you.
      </p>
      <Link
        href="/support/new"
        className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
      >
        <Plus size={16} />
        Open a ticket
      </Link>
    </div>
  );
}

function SkeletonList() {
  return (
    <ul className="space-y-3">
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          className="h-20 animate-pulse rounded-lg border border-slate-200 bg-white"
        />
      ))}
    </ul>
  );
}
