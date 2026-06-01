"use client";

/**
 * "Open a ticket" form.
 *
 * Kept minimal per spec: category, subject (200 char max), body. The optional
 * `related_reservation` / `related_shop` fields aren't surfaced in v1 — the
 * backend accepts null and the customer can mention the booking reference in
 * the body if they need to. We can wire reservation lookup later.
 */

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LifeBuoy } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatApiError } from "@/lib/errors";
import {
  CATEGORY_LABEL,
  TICKET_CATEGORIES,
  createTicket,
  type TicketCategory,
} from "@/lib/support";
import { PageHeader } from "@/components/PageHeader";

const SUBJECT_MAX = 200;

export default function NewTicketPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user, fetchMe } = useAuth();

  useEffect(() => {
    fetchMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [category, setCategory] = useState<TicketCategory>("other");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: createTicket,
    onSuccess: (ticket) => {
      qc.invalidateQueries({ queryKey: ["tickets"] });
      router.replace(`/support/${ticket.id}`);
    },
    onError: (err: unknown) => {
      // Backend sends 429 with a friendly throttled message; formatApiError
      // handles it, but we override for the most common case so it reads
      // less like a stack trace.
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      if (status === 429) {
        setError(
          "You've opened a lot of tickets recently. Please try again in an hour."
        );
        return;
      }
      setError(formatApiError(err, "Couldn't open your ticket."));
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const subj = subject.trim();
    const text = body.trim();
    if (!subj) {
      setError("Subject is required.");
      return;
    }
    if (!text) {
      setError("Please describe your issue.");
      return;
    }
    setError(null);
    mutation.mutate({ category, subject: subj, body: text });
  }

  if (!user) {
    return (
      <div className="py-12">
        <p className="rounded-md border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          Please sign in to open a ticket.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 py-4">
      <PageHeader
        backHref="/support"
        backLabel="Back to tickets"
        title="Open a ticket"
        icon={LifeBuoy}
        description="Give us a bit of context and we'll get back to you."
      />

      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-lg border border-slate-200 bg-white p-4 sm:p-6"
      >
        <div>
          <label
            htmlFor="category"
            className="block text-sm font-medium text-slate-700"
          >
            Category
          </label>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value as TicketCategory)}
            disabled={mutation.isPending}
            className="mt-1 h-11 w-full rounded-md border border-slate-300 px-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            {TICKET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label
              htmlFor="subject"
              className="block text-sm font-medium text-slate-700"
            >
              Subject
            </label>
            <span
              className={`text-xs ${
                subject.length > SUBJECT_MAX - 20
                  ? "text-amber-700"
                  : "text-slate-400"
              }`}
            >
              {subject.length} / {SUBJECT_MAX}
            </span>
          </div>
          <input
            id="subject"
            type="text"
            value={subject}
            maxLength={SUBJECT_MAX}
            onChange={(e) => setSubject(e.target.value)}
            disabled={mutation.isPending}
            placeholder="Short summary"
            required
            className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        <div>
          <label
            htmlFor="body"
            className="block text-sm font-medium text-slate-700"
          >
            Describe the issue
          </label>
          <textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={mutation.isPending}
            rows={8}
            placeholder="What happened? What did you expect to happen? Include booking references if relevant."
            required
            className="mt-1 min-h-[160px] w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <p className="mt-1 text-xs text-slate-500">
            You can attach screenshots or PDFs after the ticket is opened.
          </p>
        </div>

        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Link
            href="/support"
            className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {mutation.isPending ? "Submitting…" : "Submit ticket"}
          </button>
        </div>
      </form>
    </div>
  );
}
