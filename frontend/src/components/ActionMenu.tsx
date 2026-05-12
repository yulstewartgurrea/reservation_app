"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, type LucideIcon } from "lucide-react";

export type ActionMenuItem = {
  label: string;
  onClick: () => void;
  icon?: LucideIcon;
  /** Render in red (for destructive actions). */
  danger?: boolean;
};

/**
 * Three-dot overflow menu. Click the button to open; clicking outside or
 * picking an item closes it. Keep the API simple — caller passes an array
 * of items and we handle layout, dismissal, and keyboard escape.
 */
export function ActionMenu({
  items,
  label = "More actions",
}: {
  items: ActionMenuItem[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-expanded={open}
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-2 w-52 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          {items.map((item, i) => {
            const Icon = item.icon;
            return (
              <button
                key={i}
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                  item.danger
                    ? "text-red-700 hover:bg-red-50"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                {Icon && <Icon size={16} />}
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
