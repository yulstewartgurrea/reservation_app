"use client";

import { Paperclip } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import {
  formatFileSize,
  formatRelativeTime,
  type TicketMessage,
} from "@/lib/support";

/**
 * Renders a thread of support-ticket messages.
 *
 * Internal notes get a yellow tint + "Internal note" label so admins can see
 * at a glance which replies the customer doesn't see. Non-admin viewers will
 * never receive an internal message thanks to backend filtering, but we
 * render them distinctly when they do appear (e.g. an admin viewing the
 * customer-facing page).
 */
export function TicketMessageList({
  messages,
  emptyHint = "No replies yet.",
}: {
  messages: TicketMessage[];
  emptyHint?: string;
}) {
  if (messages.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
        {emptyHint}
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {messages.map((m) => (
        <li key={m.id}>
          <MessageRow message={m} />
        </li>
      ))}
    </ul>
  );
}

function MessageRow({ message }: { message: TicketMessage }) {
  const author = message.author;
  const name = author?.display_name || author?.email || "Unknown";
  const isInternal = message.is_internal;
  const wrapperClass = isInternal
    ? "rounded-lg border border-amber-200 bg-amber-50 p-4"
    : "rounded-lg border border-slate-200 bg-white p-4";

  return (
    <article className={wrapperClass}>
      <header className="mb-2 flex items-center gap-3">
        <Avatar name={name} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="truncate text-sm font-semibold text-slate-900">
              {name}
            </span>
            {author?.role === "admin" && (
              <span className="rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand-700">
                Staff
              </span>
            )}
            {isInternal && (
              <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-900">
                Internal note
              </span>
            )}
          </div>
          <time
            className="text-xs text-slate-500"
            dateTime={message.created_at}
            title={new Date(message.created_at).toLocaleString()}
          >
            {formatRelativeTime(message.created_at)}
          </time>
        </div>
      </header>
      <div className="whitespace-pre-wrap break-words text-sm text-slate-800">
        {message.body}
      </div>
      {message.attachments.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {message.attachments.map((a) => (
            <li key={a.id}>
              <a
                href={a.file ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
              >
                <Paperclip size={12} className="flex-shrink-0" />
                <span className="truncate" title={a.original_name}>
                  {a.original_name}
                </span>
                <span className="flex-shrink-0 text-slate-400">
                  {formatFileSize(a.size)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
