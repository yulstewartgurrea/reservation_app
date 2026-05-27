"use client";

import Link from "next/link";
import { ArrowRight, MapPin, Star } from "lucide-react";

export type ShopCardData = {
  id: number;
  name: string;
  city: string;
  country?: string;
  status?: "active" | "paused" | "pending";
  cover_photo?: string | null;
  distance_km?: number;
  categories?: { id: number; name: string }[];
  // Added by the public list endpoint (annotated):
  services_count?: number;
  reviews_count?: number;
  avg_rating?: number | null;
  is_open_now?: boolean;
};

const ADMIN_STATUS_PILL: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  paused: "bg-amber-100 text-amber-800",
  pending: "bg-slate-100 text-slate-700",
};

/**
 * Photo-forward shop card used on the public /shops grid AND the owner
 * /my-shops list. The richer fields (rating, services_count, is_open_now)
 * are populated by the public list endpoint; when absent the card degrades
 * to a simpler layout for the owner view.
 *
 * Pass `showStatus` to render the admin status (Active / Paused / Pending)
 * pill instead of the public Open / Closed pill.
 */
export function ShopCard({
  shop,
  href,
  cta = "View shop",
  showStatus = false,
}: {
  shop: ShopCardData;
  href: string;
  cta?: string;
  showStatus?: boolean;
}) {
  const hasRichInfo =
    shop.avg_rating !== undefined ||
    shop.reviews_count !== undefined ||
    shop.services_count !== undefined;

  return (
    <li className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      {/* COVER */}
      <Link href={href} className="relative block">
        <div className="aspect-[4/3] w-full overflow-hidden bg-slate-100">
          {shop.cover_photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={shop.cover_photo}
              alt={shop.name}
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <ShopPlaceholder name={shop.name} />
          )}
        </div>
        <ImagePill shop={shop} showStatus={showStatus} />
      </Link>

      {/* BODY */}
      <div className="flex flex-1 flex-col p-5">
        {/* Title + location */}
        <div className="min-w-0">
          <Link
            href={href}
            className="block text-lg font-semibold leading-snug text-slate-900 line-clamp-2 hover:underline"
          >
            {shop.name}
          </Link>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-500">
            <MapPin size={14} className="flex-shrink-0 text-slate-400" />
            <span className="truncate">
              {[shop.city, shop.country].filter(Boolean).join(", ") || "—"}
            </span>
          </p>
        </div>

        {/* Category chips */}
        {(shop.categories?.length ?? 0) > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {shop.categories!.slice(0, 2).map((c) => (
              <span
                key={c.id}
                className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700"
              >
                {c.name}
              </span>
            ))}
            {shop.distance_km !== undefined && (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                {shop.distance_km} km
              </span>
            )}
          </div>
        )}

        {/* Footer (pinned to the bottom, with a subtle divider). Wraps cleanly
            on narrow widths so the rating row and the CTA never collide. */}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-slate-100 pt-4">
          {hasRichInfo ? <RatingAndServices shop={shop} /> : <span />}
          <Link
            href={href}
            className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-brand-600 px-3.5 py-2 text-sm font-medium text-brand-600 hover:bg-brand-50"
          >
            {cta}
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </li>
  );
}

function ImagePill({
  shop,
  showStatus,
}: {
  shop: ShopCardData;
  showStatus: boolean;
}) {
  // Owner view: show admin status. Public view: show open/closed when known.
  if (showStatus && shop.status) {
    return (
      <span
        className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-xs font-medium shadow-sm ${
          ADMIN_STATUS_PILL[shop.status] ?? "bg-slate-100 text-slate-700"
        }`}
      >
        {shop.status[0].toUpperCase() + shop.status.slice(1)}
      </span>
    );
  }
  if (shop.is_open_now === true) {
    return (
      <span className="absolute right-3 top-3 rounded-full bg-emerald-500 px-2.5 py-1 text-xs font-medium text-white shadow-sm">
        Open
      </span>
    );
  }
  if (shop.is_open_now === false) {
    return (
      <span className="absolute right-3 top-3 rounded-full bg-slate-700/90 px-2.5 py-1 text-xs font-medium text-white shadow-sm">
        Closed
      </span>
    );
  }
  return null;
}

function RatingAndServices({ shop }: { shop: ShopCardData }) {
  const hasRating =
    shop.avg_rating !== undefined &&
    shop.avg_rating !== null &&
    (shop.reviews_count ?? 0) > 0;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        {hasRating ? (
          <>
            <Star size={14} className="fill-amber-400 text-amber-400" />
            <span className="font-semibold text-slate-900">
              {shop.avg_rating!.toFixed(1)}
            </span>
            <span className="text-slate-500">({shop.reviews_count})</span>
          </>
        ) : (
          <span className="text-slate-400">No reviews yet</span>
        )}
      </span>
      {shop.services_count !== undefined && (
        <>
          <span className="text-slate-300" aria-hidden>
            •
          </span>
          <span className="whitespace-nowrap text-slate-600">
            {shop.services_count}{" "}
            {shop.services_count === 1 ? "service" : "services"}
          </span>
        </>
      )}
    </div>
  );
}

/**
 * Photo placeholder — colored block with the shop's first letter.
 * Deterministic background color per name so multiple shops look distinct.
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
