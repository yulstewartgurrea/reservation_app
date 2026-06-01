"use client";

/**
 * Customer / shop-owner thread view.
 *
 * Non-admin viewers requesting a ticket they don't own get a 404 from the
 * backend (deliberate — no role-disclosure side-channel). Render that as a
 * friendly "not found" card with a link back to the list.
 */

import { useEffect } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LifeBuoy } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatApiError } from "@/lib/errors";
import { formatRelativeTime, getTicket } from "@/lib/support";
import { useUrlParams } from "@/lib/useUrlParams";
import { PageHeader } from "@/components/PageHeader";
import { TicketCategoryBadge } from "@/components/support/TicketCategoryBadge";
import { TicketMessageList } from "@/components/support/TicketMessageList";
import { TicketPriorityPill } from "@/components/support/TicketPriorityPill";
import { TicketReplyForm } from "@/components/support/TicketReplyForm";
import { TicketStatusPill } from "@/components/support/TicketStatusPill";

export default function TicketDetailClient() {
  const { id } = useUrlParams<{ id: string }>("/support/[id]");
  const qc = useQueryClient();
  const { user, fetchMe } = useAuth();

  useEffect(() => {
    fetchMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: ticket, isLoading, error, refetch } = useQuery({
    queryKey: ["ticket", id],
    queryFn: () => getTicket(id),
    enabled: !!user && !!id,
    retry: (count, err) => {
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      // Don't retry on 404 — that's the legit "not your ticket" case.
      if (status === 404) return false;
      return count < 2;
    },
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["ticket", id] });
    qc.invalidateQueries({ queryKey: ["tickets"] });
    refetch();
  }

  if (!user) {
    return (
      <div className="py-12">
        <p className="rounded-md border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          Please sign in to view this ticket.
        </p>
      </div>
    );
  }

  const status = (error as { response?: { status?: number } } | null)?.response
    ?.status;
  if (status === 404) {
    return (
      <div className="space-y-6 py-4">
        <PageHeader
          backHref="/support"
          backLabel="Back to tickets"
          title="Ticket not found"
          icon={LifeBuoy}
        />
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-slate-700">We couldn't find that ticket.</p>
          <p className="mt-1 text-sm text-slate-500">
            It may have been removed or you may not have access to it.
          </p>
          <Link
            href="/support"
            className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Back to tickets
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading || !id) {
    return (
      <div className="space-y-6 py-4">
        <PageHeader
          backHref="/support"
          backLabel="Back to tickets"
          title="Loading ticket…"
          icon={LifeBuoy}
        />
        <div className="h-32 animate-pulse rounded-lg border border-slate-200 bg-white" />
        <div className="h-24 animate-pulse rounded-lg border border-slate-200 bg-white" />
        <div className="h-40 animate-pulse rounded-lg border border-slate-200 bg-white" />
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="space-y-6 py-4">
        <PageHeader
          backHref="/support"
          backLabel="Back to tickets"
          title="Support"
          icon={LifeBuoy}
        />
        <p className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {formatApiError(error, "Couldn't load this ticket.")}
        </p>
      </div>
    );
  }

  const submitter = ticket.submitter;
  const submitterName = submitter?.display_name ?? "you";

  return (
    <div className="space-y-6 py-4">
      <PageHeader
        backHref="/support"
        backLabel="Back to tickets"
        title={ticket.subject}
        icon={LifeBuoy}
      />

      <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <TicketStatusPill status={ticket.status} />
          <TicketPriorityPill priority={ticket.priority} />
          <TicketCategoryBadge category={ticket.category} />
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Submitted{" "}
          {ticket.submitter?.id === user.id ? "by you" : `by ${submitterName}`} ·{" "}
          <time
            dateTime={ticket.created_at}
            title={new Date(ticket.created_at).toLocaleString()}
          >
            {formatRelativeTime(ticket.created_at)}
          </time>
        </p>
        {ticket.related_reservation && (
          <p className="mt-1 text-xs text-slate-500">
            Related booking:{" "}
            <span className="font-mono text-slate-700">
              {ticket.related_reservation.reference}
            </span>
          </p>
        )}
        {ticket.related_shop && (
          <p className="mt-1 text-xs text-slate-500">
            Related shop:{" "}
            <span className="text-slate-700">{ticket.related_shop.name}</span>
          </p>
        )}
        <div className="mt-4 whitespace-pre-wrap break-words text-sm text-slate-800">
          {ticket.body}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Conversation
        </h2>
        <TicketMessageList
          messages={ticket.messages}
          emptyHint="No replies yet. Add the first one below."
        />
      </section>

      {ticket.status === "closed" ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          This ticket is closed. If you need to follow up, please open a new
          ticket.
        </div>
      ) : (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Reply
          </h2>
          <TicketReplyForm ticketId={ticket.id} onSent={refresh} />
        </section>
      )}
    </div>
  );
}
