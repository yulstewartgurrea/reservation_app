"use client";

import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { iconForService } from "@/lib/serviceIcons";

export type ServiceCardData = {
  id: number;
  name: string;
  /** Legacy single-photo field (kept for backwards compat). */
  photo?: string | null;
  /** Preferred: first gallery image, falls back to legacy `photo` server-side. */
  cover_photo?: string | null;
  duration_minutes: number;
  price: string;
  is_active: boolean;
};

/**
 * Airbnb-style photo-forward service card.
 *
 * Layout: full-bleed image on top (square-ish), small status/category pill in
 * the top-left, title below, single-line "$price · duration" beneath, and a
 * compact action row at the bottom.
 *
 * When the service has no uploaded photo, we render a colored block with the
 * service-themed icon — same trick `ShopCard` uses for missing covers.
 */
export function ServiceCard({
  service,
  editHref,
  onDelete,
}: {
  service: ServiceCardData;
  editHref: string;
  onDelete: () => void;
}) {
  const cover = service.cover_photo ?? service.photo ?? null;

  return (
    <li className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition hover:shadow-md">
      <Link href={editHref} className="block">
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt={service.name}
              className="h-full w-full object-cover transition group-hover:scale-105"
            />
          ) : (
            <ServicePlaceholder name={service.name} />
          )}
          <span
            className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-xs font-medium shadow-sm ${
              service.is_active
                ? "bg-white text-slate-900"
                : "bg-slate-900/80 text-white"
            }`}
          >
            {service.is_active ? "Active" : "Inactive"}
          </span>
        </div>
      </Link>

      <div className="px-4 pt-3">
        <Link
          href={editHref}
          className="block truncate text-base font-semibold text-slate-900 hover:underline"
        >
          {service.name}
        </Link>
        <p className="mt-0.5 text-sm text-slate-600">
          <span className="font-medium text-slate-900">${service.price}</span>
          <span className="mx-1.5 text-slate-300">·</span>
          {service.duration_minutes} min
        </p>
      </div>

      <div className="mt-3 flex items-center gap-2 px-4 pb-4">
        <Link
          href={editHref}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Pencil size={14} />
          Edit
        </Link>
        <button
          onClick={onDelete}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          <Trash2 size={14} />
          Delete
        </button>
      </div>
    </li>
  );
}

/** Placeholder for services without an uploaded photo. */
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
