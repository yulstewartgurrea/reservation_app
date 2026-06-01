"use client";

/**
 * Admin ticket detail / manage page.
 *
 * Same thread render as the customer page, plus:
 * - Status transition dropdown (only the transitions the backend allows)
 * - Priority dropdown
 * - Assign-to-me / unassign quick actions (a full admin-picker would need
 *   an admins list endpoint that doesn't exist yet — flagged as a follow-up)
 * - Internal-note toggle on the reply form
 * - Events sidebar from `ticket.events`
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LifeBuoy } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatApiError } from "@/lib/errors";
import {
  PRIORITY_LABEL,
  STATUS_LABEL,
  STATUS_TRANSITIONS,
  TICKET_PRIORITIES,
  assignTicket,
  formatRelativeTime,
  getTicket,
  patchTicket,
  transitionTicket,
  type TicketPriority,
  type TicketStatus,
} from "@/lib/support";
import { useUrlParams } from "@/lib/useUrlParams";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { PageHeader } from "@/components/PageHeader";
import { Toast, type ToastMessage } from "@/components/Toast";
import { TicketCategoryBadge } from "@/components/support/TicketCategoryBadge";
import { TicketEventList } from "@/components/support/TicketEventList";
import { TicketMessageList } from "@/components/support/TicketMessageList";
import { TicketPriorityPill } from "@/components/support/TicketPriorityPill";
import { TicketReplyForm } from "@/components/support/TicketReplyForm";
import { TicketStatusPill } from "@/components/support/TicketStatusPill";

export default function AdminTicketClient() {
  const { id } = useUrlParams<{ id: string }>("/admin/tickets/[id]");
  const qc = useQueryClient();
  const { user, fetchMe } = useAuth();

  useEffect(() => {
    fetchMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: ticket, isLoading, error, refetch } = useQuery({
    queryKey: ["ticket", id, "admin"],
    queryFn: () => getTicket(id),
    enabled: user?.role === "admin" && !!id,
  });

  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [pendingClose, setPendingClose] = useState(false);
  const [busy, setBusy] = useState(false);

  const allowedTransitions = useMemo<TicketStatus[]>(() => {
    if (!ticket) return [];
    return STATUS_TRANSITIONS[ticket.status] ?? [];
  }, [ticket]);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["ticket", id] });
    qc.invalidateQueries({ queryKey: ["tickets"] });
    refetch();
  }

  async function runAction<T>(fn: () => Promise<T>, successMsg: string) {
    setBusy(true);
    try {
      await fn();
      setToast({ variant: "success", message: successMsg });
      invalidate();
    } catch (err) {
      setToast({
        variant: "error",
        message: formatApiError(err, "Action failed."),
      });
    } finally {
      setBusy(false);
    }
  }

  function handleStatusPick(next: TicketStatus) {
    if (!ticket || next === ticket.status) return;
    if (next === "closed") {
      setPendingClose(true);
      return;
    }
    runAction(
      () => transitionTicket(ticket.id, next),
      `Status set to ${STATUS_LABEL[next]}.`
    );
  }

  function handlePriorityPick(next: TicketPriority) {
    if (!ticket || next === ticket.priority) return;
    runAction(
      () => patchTicket(ticket.id, { priority: next }),
      `Priority set to ${PRIORITY_LABEL[next]}.`
    );
  }

  function handleAssignToMe() {
    if (!ticket || !user) return;
    if (ticket.assigned_to?.id === user.id) return;
    runAction(
      () => assignTicket(ticket.id, user.id),
      "Assigned to you."
    );
  }

  function handleUnassign() {
    if (!ticket) return;
    if (!ticket.assigned_to) return;
    runAction(() => assignTicket(ticket.id, null), "Unassigned.");
  }

  if (user && user.role !== "admin") {
    return (
      <div className="py-10 text-center text-sm text-slate-500">
        Admin access required.
      </div>
    );
  }

  if (isLoading || !user || !id) {
    return (
      <div className="space-y-6 py-4">
        <PageHeader
          backHref="/admin/tickets"
          backLabel="Back to queue"
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
          backHref="/admin/tickets"
          backLabel="Back to queue"
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

  return (
    <div className="space-y-6 py-4">
      <PageHeader
        backHref="/admin/tickets"
        backLabel="Back to queue"
        title={ticket.subject}
        icon={LifeBuoy}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-6 min-w-0">
          {/* Original post */}
          <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <TicketStatusPill status={ticket.status} />
              <TicketPriorityPill priority={ticket.priority} />
              <TicketCategoryBadge category={ticket.category} />
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Submitted by{" "}
              <span className="text-slate-700">
                {submitter?.display_name ?? "—"}
              </span>{" "}
              ({submitter?.email}) ·{" "}
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

          {/* Thread */}
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Conversation
            </h2>
            <TicketMessageList
              messages={ticket.messages}
              emptyHint="No replies yet."
            />
          </section>

          {/* Reply */}
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Reply
            </h2>
            <TicketReplyForm
              ticketId={ticket.id}
              allowInternal
              onSent={invalidate}
              disabled={busy}
            />
          </section>
        </div>

        {/* Manage sidebar */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:h-fit">
          <ManageCard title="Status">
            {allowedTransitions.length === 0 ? (
              <p className="text-xs text-slate-500">No transitions available.</p>
            ) : (
              <select
                value={ticket.status}
                onChange={(e) =>
                  handleStatusPick(e.target.value as TicketStatus)
                }
                disabled={busy}
                className="h-11 w-full rounded-md border border-slate-300 px-2 text-sm"
              >
                <option value={ticket.status} disabled>
                  {STATUS_LABEL[ticket.status]} (current)
                </option>
                {allowedTransitions.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            )}
          </ManageCard>

          <ManageCard title="Priority">
            <select
              value={ticket.priority}
              onChange={(e) =>
                handlePriorityPick(e.target.value as TicketPriority)
              }
              disabled={busy}
              className="h-11 w-full rounded-md border border-slate-300 px-2 text-sm"
            >
              {TICKET_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </ManageCard>

          <ManageCard title="Assignee">
            <p className="text-sm text-slate-700">
              {ticket.assigned_to ? (
                <>
                  {ticket.assigned_to.display_name}
                  {ticket.assigned_to.id === user.id && (
                    <span className="ml-1 text-xs text-slate-500">(you)</span>
                  )}
                </>
              ) : (
                <span className="text-slate-400">Unassigned</span>
              )}
            </p>
            <div className="mt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleAssignToMe}
                disabled={busy || ticket.assigned_to?.id === user.id}
                className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                Assign to me
              </button>
              <button
                type="button"
                onClick={handleUnassign}
                disabled={busy || !ticket.assigned_to}
                className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Unassign
              </button>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              Custom assignees require an admins-list endpoint (coming later).
            </p>
          </ManageCard>

          <ManageCard title="Audit log">
            {ticket.events ? (
              <TicketEventList events={ticket.events} />
            ) : (
              <p className="text-xs text-slate-500">No audit data.</p>
            )}
          </ManageCard>
        </aside>
      </div>

      <ConfirmationDialog
        open={pendingClose}
        title="Close ticket"
        description="Closing a ticket archives it. The customer can no longer reply — they'd have to open a new ticket. You can reopen this ticket later from the status dropdown."
        confirmLabel="Close ticket"
        variant="danger"
        context={[
          { label: "Subject", value: ticket.subject },
          { label: "Submitter", value: submitter?.display_name ?? "—" },
          { label: "Current status", value: STATUS_LABEL[ticket.status] },
        ]}
        onConfirm={async () => {
          setPendingClose(false);
          await runAction(
            () => transitionTicket(ticket.id, "closed"),
            "Ticket closed."
          );
        }}
        onCancel={() => setPendingClose(false)}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />

      <p className="text-xs text-slate-400">
        <Link
          href="/admin/tickets"
          className="hover:text-slate-600 hover:underline"
        >
          ← Back to queue
        </Link>
      </p>
    </div>
  );
}

function ManageCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </p>
      {children}
    </div>
  );
}
