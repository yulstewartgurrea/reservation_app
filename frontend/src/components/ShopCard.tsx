"use client";

import Link from "next/link";

export type ShopCardData = {
  id: number;
  name: string;
  city: string;
  country?: string;
  status?: "active" | "paused" | "pending";
  cover_photo?: string | null;
  distance_km?: number;
  categories?: { id: number; name: string }[];
};

const STATUS_PILL: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  paused: "bg-amber-100 text-amber-800",
  pending: "bg-slate-100 text-slate-700",
};

/**
 * Photo-forward shop card. Used by /my-shops (owner) and /shops (public).
 *
 * Layout: cover image on top, body underneath with title, location, optional
 * status pill / distance, and an outlined CTA on the right.
 */
export function ShopCard({
  shop,
  href,
  cta = "Open",
  showStatus = false,
}: {
  shop: ShopCardData;
  href: string;
  cta?: string;
  showStatus?: boolean;
}) {
  return (
    <li className="overflow-hidden rounded-lg bg-white shadow-sm transition hover:shadow-md">
      <Link href={href} className="block">
        <div className="aspect-[4/3] w-full overflow-hidden bg-slate-100">
          {shop.cover_photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={shop.cover_photo}
              alt={shop.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <ShopPlaceholder name={shop.name} />
          )}
        </div>
      </Link>

      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <Link
            href={href}
            className="block truncate text-base font-semibold text-slate-900 hover:underline"
          >
            {shop.name}
          </Link>
          <p className="truncate text-sm text-slate-500">
            {[shop.city, shop.country].filter(Boolean).join(", ")}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {showStatus && shop.status && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  STATUS_PILL[shop.status] ?? "bg-slate-100 text-slate-700"
                }`}
              >
                {shop.status}
              </span>
            )}
            {shop.distance_km !== undefined && (
              <span className="text-xs text-slate-500">{shop.distance_km} km away</span>
            )}
            {shop.categories?.slice(0, 2).map((c) => (
              <span
                key={c.id}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
              >
                {c.name}
              </span>
            ))}
          </div>
        </div>
        <Link
          href={href}
          className="flex-shrink-0 rounded-md border border-brand-600 px-4 py-2 text-sm font-medium text-brand-600 hover:bg-brand-50"
        >
          {cta}
        </Link>
      </div>
    </li>
  );
}

/**
 * Photo placeholder — colored block with a building glyph and the shop's first
 * letter. Deterministic background color per name so multiple shops look distinct.
 */
function ShopPlaceholder({ name }: { name: string }) {
  const colors = [
    "bg-brand-100",
    "bg-emerald-100",
    "bg-amber-100",
    "bg-sky-100",
    "bg-rose-100",
    "bg-violet-100",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i)) % colors.length;
  const initial = name.trim()[0]?.toUpperCase() ?? "?";
  return (
    <div className={`flex h-full w-full items-center justify-center ${colors[hash]}`}>
      <span className="text-5xl font-semibold text-slate-700">{initial}</span>
    </div>
  );
}
