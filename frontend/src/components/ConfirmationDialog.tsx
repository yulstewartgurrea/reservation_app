"use client";

import { useEffect, useState } from "react";
import { Modal } from "./Modal";

type Variant = "primary" | "danger" | "warning";

const VARIANT_CLASS: Record<Variant, string> = {
  primary: "bg-brand-600 hover:bg-brand-700",
  danger: "bg-red-600 hover:bg-red-700",
  warning: "bg-amber-600 hover:bg-amber-700",
};

/**
 * Reusable confirmation dialog.
 *
 * Use for destructive or significant actions (Confirm booking, Decline, Cancel,
 * Refund, etc.). Optionally collects a free-text reason that the caller can
 * forward to the API.
 */
export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Back",
  variant = "primary",
  requireReason = false,
  reasonLabel = "Reason (optional)",
  reasonPlaceholder = "",
  onConfirm,
  onCancel,
  context,
}: {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: Variant;
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  onConfirm: (reason: string) => Promise<void> | void;
  onCancel: () => void;
  /** Optional list of "Label: value" rows shown above the action. */
  context?: { label: string; value: string }[];
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reset the reason when the dialog is re-opened.
  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await onConfirm(reason);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onCancel} title={title}>
      {description && <div className="mb-3 text-sm text-slate-600">{description}</div>}

      {context && context.length > 0 && (
        <dl className="mb-4 space-y-1 rounded-md bg-slate-50 p-3 text-sm">
          {context.map((row) => (
            <div key={row.label} className="flex justify-between gap-3">
              <dt className="text-slate-500">{row.label}</dt>
              <dd className="text-right font-medium text-slate-900">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {requireReason && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700">{reasonLabel}</label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={reasonPlaceholder}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={submitting}
          className={`rounded-md px-4 py-2 text-sm text-white disabled:opacity-50 ${VARIANT_CLASS[variant]}`}
        >
          {submitting ? "Working…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
