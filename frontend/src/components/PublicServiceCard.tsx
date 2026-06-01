"use client";

import Link from "next/link";
import { BadgeCheck, Star, Store } from "lucide-react";
import { iconForService } from "@/lib/serviceIcons";

export type PublicServiceHit = {
  id: number;
  name: string;
  duration_minutes: number;
  price: string;
  cover_photo?: string | null;
  shop_id: number;
  shop_name: string;
  shop_city: string;
  category?: string | null;
  shop_avg_rating?: number | null;
  shop_reviews_count?: number;
};

/**
 * Customer-facing service card.
 *
 * Cover photo on top with a category chip in the corner, body with title +
 * price + rating, and a footer row pinned to the bottom showing the shop chip
 * (with verified check) and a solid Book button. Both the cover and the
 * title link to the booking flow; the Book button gives an unambiguous CTA.
 *
 * Pass `hideShop` on shop detail pages where the shop chip is redundant.
 */
export function PublicServiceCard({
  service,
  hideShop = false,
}: {
  service: PublicServiceHit;
  hideShop?: boolean;
}) {
  const bookHref = `/shops/${service.shop_id}/book?service=${service.id}`;
  const shopHref = `/shops/${service.shop_id}`;
  const CategoryIcon = iconForService(service.category || service.name);

  const hasRating =
    service.shop_avg_rating !== undefined &&
    service.shop_avg_rating !== null &&
    (service.shop_reviews_count ?? 0) > 0;

  return (
    <li className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      {/* COVER */}
      <Link href={bookHref} className="relative block">
        <div className="aspect-[4/3] w-full overflow-hidden bg-slate-100">
          {service.cover_photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={service.cover_photo}
              alt={service.name}
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <ServicePlaceholder name={service.name} />
          )}
        </div>
        {service.category && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-xs font-medium text-slate-900 shadow-sm backdrop-blur">
            <CategoryIcon size={14} className="text-brand-600" />
            {service.category}
          </span>
        )}
      </Link>

      {/* BODY */}
      <div className="flex flex-1 flex-col p-5">
        <Link
          href={bookHref}
          className="block text-base font-semibold leading-snug text-slate-900 line-clamp-2 hover:underline"
        >
          {service.name}
        </Link>

        <p className="mt-1.5 text-sm text-slate-500">
          From <span className="font-semibold text-slate-900">${service.price}</span>
        </p>

        <div className="mt-2 text-sm">
          {hasRating ? (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <Star size={14} className="fill-amber-400 text-amber-400" />
              <span className="font-semibold text-slate-900">
                {service.shop_avg_rating!.toFixed(1)}
              </span>
              <span className="text-slate-300" aria-hidden>
                •
              </span>
              <span className="text-slate-500">
                ({service.shop_reviews_count} {service.shop_reviews_count === 1 ? "review" : "reviews"})
              </span>
            </span>
          ) : (
            <span className="text-slate-400">No reviews yet</span>
          )}
        </div>

        {/* Footer pinned to bottom with a divider — shop chip on the left,
            solid Book button on the right. Wraps gracefully on narrow widths. */}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          {!hideShop ? (
            <Link
              href={shopHref}
              className="inline-flex min-w-0 items-center gap-2 truncate text-sm text-slate-700 hover:text-brand-700"
              title={service.shop_name}
            >
              <span className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <Store size={14} />
              </span>
              <span className="truncate font-medium">{service.shop_name}</span>
              <BadgeCheck
                size={14}
                className="flex-shrink-0 fill-brand-600 text-white"
                aria-label="Verified shop"
              />
            </Link>
          ) : (
            <span />
          )}
          <Link
            href={bookHref}
            className="inline-flex flex-shrink-0 items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Book
          </Link>
        </div>
      </div>
    </li>
  );
}

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
