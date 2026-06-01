"use client";

import Link from "next/link";
import { ArrowRight, MapPin, Star } from "lucide-react";
import type { ShopCardData } from "@/components/ShopCard";

/**
 * Horizontal list-view variant of the shop card. Image on the left, info on
 * the right, CTA at the far right. Same data shape as ShopCard so the page
 * can toggle between grid and list without re-fetching.
 */
export function ShopListRow({
  shop,
  href,
  cta = "View shop",
}: {
  shop: ShopCardData;
  href: string;
  cta?: string;
}) {
  return (
    <li className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      <div className="flex flex-col sm:flex-row">
        {/* Image */}
        <Link
          href={href}
          className="relative block w-full flex-shrink-0 sm:w-56 md:w-64"
        >
          <div className="aspect-[4/3] w-full overflow-hidden bg-slate-100 sm:aspect-auto sm:h-full">
            {shop.cover_photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={shop.cover_photo}
                alt={shop.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <Placeholder name={shop.name} />
            )}
          </div>
          {shop.is_open_now === true && (
            <span className="absolute right-3 top-3 rounded-full bg-emerald-500 px-2.5 py-0.5 text-xs font-medium text-white shadow-sm">
              Open
            </span>
          )}
          {shop.is_open_now === false && (
            <span className="absolute right-3 top-3 rounded-full bg-slate-700/90 px-2.5 py-0.5 text-xs font-medium text-white shadow-sm">
              Closed
            </span>
          )}
        </Link>

        {/* Body */}
        <div className="flex flex-1 flex-col justify-between gap-3 p-5">
          <div className="min-w-0">
            <Link
              href={href}
              className="block truncate text-base font-semibold text-slate-900 hover:underline"
            >
              {shop.name}
            </Link>
            <p className="mt-1 flex items-center gap-1 truncate text-sm text-slate-500">
              <MapPin size={14} className="flex-shrink-0 text-slate-400" />
              <span className="truncate">
                {[shop.city, shop.country].filter(Boolean).join(", ") || "—"}
              </span>
            </p>
            {(shop.categories?.length ?? 0) > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {shop.categories!.slice(0, 3).map((c) => (
                  <span
                    key={c.id}
                    className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700"
                  >
                    {c.name}
                  </span>
                ))}
                {shop.distance_km !== undefined && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
                    {shop.distance_km} km
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <RatingAndServices shop={shop} />
            <Link
              href={href}
              className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-brand-600 px-4 py-2 text-sm font-medium text-brand-600 hover:bg-brand-50"
            >
              {cta}
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    </li>
  );
}

function RatingAndServices({ shop }: { shop: ShopCardData }) {
  const hasRating =
    shop.avg_rating !== undefined &&
    shop.avg_rating !== null &&
    (shop.reviews_count ?? 0) > 0;
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm">
      {hasRating ? (
        <span className="inline-flex items-center gap-1">
          <Star size={14} className="fill-amber-400 text-amber-400" />
          <span className="font-semibold text-slate-900">
            {shop.avg_rating!.toFixed(1)}
          </span>
          <span className="text-slate-500">({shop.reviews_count})</span>
        </span>
      ) : (
        <span className="text-slate-400">No reviews yet</span>
      )}
      {shop.services_count !== undefined && (
        <>
          <span className="text-slate-300">·</span>
          <span className="text-slate-600">
            {shop.services_count} {shop.services_count === 1 ? "service" : "services"}
          </span>
        </>
      )}
    </div>
  );
}

function Placeholder({ name }: { name: string }) {
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
