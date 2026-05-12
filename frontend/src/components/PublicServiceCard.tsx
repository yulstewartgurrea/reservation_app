"use client";

import Link from "next/link";
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
};

/**
 * Customer-facing service card.
 *
 * Airbnb-style: large photo on top with a category badge in the corner, title
 * underneath, "From $X", optional shop line, and a brand-purple **Book** button
 * at the bottom-right. The photo and title are linked to the booking flow so
 * either is a click target; the explicit Book button gives a clear CTA.
 *
 * Pass `hideShop` on shop detail pages where the shop name is redundant.
 */
export function PublicServiceCard({
  service,
  hideShop = false,
}: {
  service: PublicServiceHit;
  hideShop?: boolean;
}) {
  const href = `/shops/${service.shop_id}/book?service=${service.id}`;

  return (
    <li className="group overflow-hidden rounded-2xl bg-white shadow-sm transition hover:shadow-md">
      <Link href={href} className="block">
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100">
          {service.cover_photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={service.cover_photo}
              alt={service.name}
              className="h-full w-full object-cover transition group-hover:scale-[1.02]"
            />
          ) : (
            <ServicePlaceholder name={service.name} />
          )}
          {service.category && (
            <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-xs font-medium text-slate-900 shadow-sm">
              {service.category}
            </span>
          )}
        </div>
      </Link>

      <div className="flex items-end justify-between gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <Link
            href={href}
            className="block truncate text-base font-semibold text-slate-900 hover:underline"
          >
            {service.name}
          </Link>
          <p className="mt-1 text-sm font-medium text-slate-900">
            From ${service.price}
          </p>
          {!hideShop && (
            <p className="mt-0.5 truncate text-sm text-slate-500">
              {service.shop_name} · {service.shop_city}
            </p>
          )}
        </div>
        <Link
          href={href}
          className="flex-shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Book
        </Link>
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
