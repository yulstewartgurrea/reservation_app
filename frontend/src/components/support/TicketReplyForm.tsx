"use client";

import { useRef, useState, type FormEvent } from "react";
import { Paperclip, X } from "lucide-react";
import { formatApiError } from "@/lib/errors";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_FILES,
  formatFileSize,
  postMessage,
  validateAttachments,
} from "@/lib/support";

/**
 * Reply composer for a ticket thread.
 *
 * Receives `allowInternal` from the parent so admin/non-admin behavior is
 * driven by props, not by reading the auth store here. Keeps the component
 * pure and easy to test.
 */
export function TicketReplyForm({
  ticketId,
  allowInternal = false,
  onSent,
  onError,
  placeholder = "Write a reply…",
  disabled = false,
}: {
  ticketId: number | string;
  allowInternal?: boolean;
  onSent: () => void;
  onError?: (msg: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isInternal, setIsInternal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFilesChosen(picked: FileList | null) {
    if (!picked) return;
    const next = [...files, ...Array.from(picked)];
    const err = validateAttachments(next);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setFiles(next);
    // Reset the underlying input so re-selecting the same file fires change.
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting || disabled) return;
    const trimmed = body.trim();
    if (!trimmed) {
      setError("Please write a reply before sending.");
      return;
    }
    const attachErr = validateAttachments(files);
    if (attachErr) {
      setError(attachErr);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await postMessage(ticketId, {
        body: trimmed,
        is_internal: allowInternal && isInternal,
        attachments: files,
      });
      setBody("");
      setFiles([]);
      setIsInternal(false);
      onSent();
    } catch (err) {
      const msg = formatApiError(err, "Couldn't send your reply.");
      setError(msg);
      onError?.(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const wrapperClass = isInternal
    ? "rounded-lg border border-amber-300 bg-amber-50 p-4"
    : "rounded-lg border border-slate-200 bg-white p-4";

  return (
    <form onSubmit={handleSubmit} className={wrapperClass}>
      <label htmlFor={`reply-${ticketId}`} className="sr-only">
        Reply
      </label>
      <textarea
        id={`reply-${ticketId}`}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        rows={4}
        disabled={submitting || disabled}
        className="min-h-[100px] w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-60"
      />

      {files.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
            >
              <Paperclip size={12} />
              <span className="max-w-[160px] truncate" title={f.name}>
                {f.name}
              </span>
              <span className="text-slate-400">{formatFileSize(f.size)}</span>
              <button
                type="button"
                onClick={() => removeFile(i)}
                aria-label={`Remove ${f.name}`}
                className="ml-1 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            <Paperclip size={16} />
            <span>Attach</span>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ATTACHMENT_ACCEPT}
              className="sr-only"
              onChange={(e) => handleFilesChosen(e.target.files)}
              disabled={submitting || disabled || files.length >= ATTACHMENT_MAX_FILES}
            />
          </label>
          <span className="text-xs text-slate-500">
            PNG, JPEG, WebP, or PDF · up to {ATTACHMENT_MAX_FILES} files · 5 MB each
          </span>
        </div>

        {allowInternal && (
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={isInternal}
              onChange={(e) => setIsInternal(e.target.checked)}
              disabled={submitting || disabled}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            Internal note (staff only)
          </label>
        )}
      </div>

      <button
        type="submit"
        disabled={submitting || disabled}
        className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60 sm:w-auto"
      >
        {submitting ? "Sending…" : isInternal ? "Post internal note" : "Send reply"}
      </button>
    </form>
  );
}
