"use client";

import { useEffect } from "react";

type Variant = "success" | "info" | "error";

const VARIANT_CLASS: Record<Variant, string> = {
  success: "bg-emerald-600",
  info: "bg-slate-800",
  error: "bg-red-600",
};

export type ToastMessage = {
  message: string;
  variant?: Variant;
};

/**
 * Minimal toast: a banner pinned to the bottom that auto-dismisses after 3s.
 * No external state library — the parent owns the message and clears it.
 */
export function Toast({
  toast,
  onDismiss,
  duration = 3000,
}: {
  toast: ToastMessage | null;
  onDismiss: () => void;
  duration?: number;
}) {
  useEffect(() => {
    if (!toast) return;
    const handle = setTimeout(onDismiss, duration);
    return () => clearTimeout(handle);
  }, [toast, duration, onDismiss]);

  if (!toast) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 transform px-4"
    >
      <div
        className={`rounded-md px-4 py-2 text-sm text-white shadow-lg ${
          VARIANT_CLASS[toast.variant ?? "info"]
        }`}
      >
        {toast.message}
      </div>
    </div>
  );
}
