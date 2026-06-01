"use client";

/**
 * Photo-forward service card used in the shop dashboard grid.
 *
 * Visual anatomy (top to bottom):
 * 1. Cover image (or themed placeholder)
 *    - Top-left: status pill (Active / Inactive)
 *    - Top-right: "more" kebab menu — contains Edit + Delete
 * 2. Title, price · duration, optional 2-line description
 *
 * All actions are consolidated into the kebab menu so the body of the card
 * stays focused on identification (image + name + price).
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { iconForService } from "@/lib/serviceIcons";

export type ServiceCardData = {
  id: number;
  name: string;
  description?: string;
  /** Primary gallery photo (or first if none flagged). Null if no photos at all. */
  cover_photo?: string | null;
  duration_minutes: number;
  price: string;
  is_active: boolean;
};

export function ServiceCard({
  service,
  editHref,
  onDelete,
}: {
  service: ServiceCardData;
  editHref: string;
  onDelete: () => void;
}) {
  const cover = service.cover_photo ?? null;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the kebab menu on outside-click and on Escape.
  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <li className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition hover:shadow-md">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100">
        <Link href={editHref} className="block h-full w-full">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt={service.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <ServicePlaceholder name={service.name} />
          )}
        </Link>

        {/* Status pill — top-left */}
        <span
          className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-xs font-medium shadow-sm ${
            service.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-900/80 text-white"
          }`}
        >
          {service.is_active ? "Active" : "Inactive"}
        </span>

        {/* Kebab — top-right */}
        <div ref={menuRef} className="absolute right-3 top-3">
          <button
            type="button"
            aria-label="More options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-slate-600 shadow-sm hover:bg-slate-50"
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-10 mt-1 w-36 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg"
            >
              <Link
                role="menuitem"
                href={editHref}
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <Pencil size={14} />
                Edit
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-1 px-4 py-4">
        <Link
          href={editHref}
          className="block truncate text-base font-semibold text-slate-900 hover:underline"
        >
          {service.name}
        </Link>
        <p className="text-sm text-slate-600">
          <span className="font-medium text-slate-900">${service.price}</span>
          <span className="mx-1.5 text-slate-300">·</span>
          {service.duration_minutes} min
        </p>
        {service.description && (
          <p className="line-clamp-2 text-sm text-slate-500">{service.description}</p>
        )}
      </div>
    </li>
  );
}

/** Themed placeholder shown when a service has no uploaded cover photo. */
function ServicePlaceholder({ name }: { name: string }) {
  const Icon = iconForService(name);
  const palette = [
    "bg-brand-100 text-brand-700",
    "bg-emerald-100 text-emerald-700",
    "bg-amber-100 text-amber-700",
    "bg-sky-100 text-sky-700",
    "bg-rose-100 text-rose-700",
    "bg-violet-100 text-violet-700",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i)) % palette.length;
  return (
    <div className={`flex h-full w-full items-center justify-center ${palette[hash]}`}>
      <Icon size={64} strokeWidth={1.5} />
    </div>
  );
}
