"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MapPin, Search, Star } from "lucide-react";
import { api } from "@/lib/api";

/**
 * Root route.
 *
 * Handles CloudFront SPA fallback for non-root routes.
 *
 * When S3 404s on a deep route (e.g.
 *     /my-shops/123 — no flat .html exists because dynamic routes
 *     export only `_` placeholders), CloudFront serves this page's
 *     /index.html with the original URL still in the address bar.
 *     We tell the App Router to navigate to that URL so Next.js
 *     resolves and renders the matching route. Without this, the home
 *     page would incorrectly render for deep links.
 *
 * The redirect runs in useEffect — NOT via the server-component
 * `redirect()` helper — because that helper bakes a
 * <meta http-equiv="refresh"> into the static export, which fires
 * before hydration and clobbers fallback resolution before
 * the client router can look at the URL.
 */

// Beta scope: Iligan City only. We display the friendly label
// ("Iligan City") but pass the canonical PSGC name ("City of Iligan",
// from `apps/locations`) to every API filter and `/shops` link so the
// match hits the value actually stored on Shop.city.
const BETA_CITY_LABEL = "Iligan City";
const BETA_CITY_NAME = "City of Iligan";

type Category = { id: number; name: string; slug: string };

type ShopHit = {
  id: number;
  name: string;
  city: string;
  cover_photo?: string | null;
  avg_rating?: number | null;
  reviews_count?: number;
  services_count?: number;
  categories?: { id: number; name: string }[];
};

type ServiceHit = {
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

type Paginated<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

// Slug → emoji. Anything not in the map falls back to a generic tag icon.
const CATEGORY_ICONS: Record<string, string> = {
  "hair-beauty": "💇",
  "wellness": "🧖",
  "home-services": "🏠",
  "automotive": "🚗",
  "fitness-training": "🏋️",
  "pet-services": "🐾",
  "tech-repair": "🛠️",
};

function iconForCategory(slug: string): string {
  return CATEGORY_ICONS[slug] ?? "🏷️";
}

// Today (YYYY-MM-DD in local time) — guards the date picker so customers
// cannot ask for shops "available yesterday".
function todayIso() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

function buildShopsHref(params: {
  city?: string;
  q?: string;
  bookingDate?: string;
  categories?: string;
}) {
  const sp = new URLSearchParams();
  if (params.city) sp.set("city", params.city);
  if (params.q && params.q.trim()) sp.set("q", params.q.trim());
  if (params.bookingDate) sp.set("booking_date", params.bookingDate);
  if (params.categories) sp.set("categories", params.categories);
  const qs = sp.toString();
  return qs ? `/shops?${qs}` : "/shops";
}

function buildServicesHref(params: {
  city?: string;
  bookingDate?: string;
  category?: string;
}) {
  const sp = new URLSearchParams();
  if (params.city) sp.set("city", params.city);
  if (params.bookingDate) sp.set("booking_date", params.bookingDate);
  if (params.category) sp.set("category", params.category);
  const qs = sp.toString();
  return qs ? `/services?${qs}` : "/services";
}

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const target = window.location.pathname + window.location.search;
    if (target !== "/") {
      router.replace(target);
    }
  }, [router]);

  const [serviceQuery, setServiceQuery] = useState("");
  const [bookingDate, setBookingDate] = useState("");

  // Live data — categories, top Iligan shops, top Iligan services.
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [topShops, setTopShops] = useState<ShopHit[]>([]);
  const [topShopsLoading, setTopShopsLoading] = useState(true);
  const [topServices, setTopServices] = useState<ServiceHit[]>([]);
  const [topServicesLoading, setTopServicesLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    api
      .get("/shops/categories/")
      .then((r) => {
        if (cancelled) return;
        const raw = (r.data?.results ?? r.data ?? []) as Category[];
        setCategories(raw);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setCategoriesLoading(false);
      });

    // Filter by the PSGC master name (`City of Iligan`) so the value matches
    // what shops actually have in their `city` column.
    api
      .get<Paginated<ShopHit>>("/shops/", {
        params: {
          city: BETA_CITY_NAME,
          ordering: "-avg_rating",
          page_size: 4,
        },
      })
      .then((r) => {
        if (!cancelled) setTopShops(r.data?.results ?? []);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setTopShopsLoading(false);
      });

    api
      .get<Paginated<ServiceHit>>("/services/discover/", {
        params: {
          city: BETA_CITY_NAME,
          ordering: "-shop_avg_rating",
          page_size: 4,
        },
      })
      .then((r) => {
        if (!cancelled) setTopServices(r.data?.results ?? []);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setTopServicesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function handleHeroSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.push(
      buildShopsHref({ city: BETA_CITY_NAME, q: serviceQuery, bookingDate })
    );
  }

  const minDate = todayIso();

  return (
    <div className="space-y-10 pb-12">
      {/* HERO — primary search form. */}
      <section className="overflow-hidden rounded-3xl bg-gradient-to-r from-brand-700 via-brand-600 to-brand-500 px-6 py-12 text-white sm:px-10 sm:py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-brand-100">BookMe</p>
        <h1 className="mt-4 max-w-3xl text-3xl font-semibold leading-tight sm:text-5xl">
          Book local services in seconds.
        </h1>
        <p className="mt-4 max-w-2xl text-base text-brand-50 sm:text-lg">
          Find salons, spas, clinics, and auto shops in Iligan — real-time availability, clear pricing, no phone calls.
        </p>

        <form
          onSubmit={handleHeroSubmit}
          className="mt-8 grid gap-3 rounded-2xl bg-white p-3 text-slate-900 shadow-2xl sm:grid-cols-[1.3fr_1fr_1fr_auto]"
        >
          <div className="rounded-xl px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Where
            </p>
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-slate-900">
              <MapPin size={14} className="text-brand-600" />
              {BETA_CITY_LABEL}
              <span className="ml-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700">
                Beta
              </span>
            </p>
          </div>

          <label className="block rounded-xl px-4 py-3 transition hover:bg-slate-50">
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Service
            </span>
            <input
              value={serviceQuery}
              onChange={(e) => setServiceQuery(e.target.value)}
              type="text"
              placeholder="Haircut, massage..."
              aria-label="Service"
              className="mt-1 w-full bg-transparent text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none"
            />
          </label>

          <label className="block rounded-xl px-4 py-3 transition hover:bg-slate-50">
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              When
            </span>
            <input
              type="date"
              value={bookingDate}
              min={minDate}
              onChange={(e) => setBookingDate(e.target.value)}
              aria-label="Booking date"
              className={`mt-1 w-full bg-transparent text-sm font-medium focus:outline-none ${
                bookingDate ? "text-slate-900" : "text-slate-400"
              }`}
            />
          </label>

          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            <Search size={16} />
            Search
          </button>
        </form>
      </section>

      {/* POPULAR CATEGORIES — real categories from /shops/categories/. */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">Popular categories</h2>
          <Link
            href={buildShopsHref({ city: BETA_CITY_NAME })}
            className="text-sm font-semibold text-slate-600 hover:text-slate-900"
          >
            Show all
          </Link>
        </div>
        {categoriesLoading ? (
          <div className="-mx-2 flex gap-3 overflow-x-auto px-2 pb-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-10 w-32 shrink-0 animate-pulse rounded-full bg-slate-100"
                aria-hidden="true"
              />
            ))}
          </div>
        ) : categories.length === 0 ? (
          <p className="text-sm text-slate-500">No categories yet.</p>
        ) : (
          <div className="-mx-2 flex gap-3 overflow-x-auto px-2 pb-1">
            {categories.map((c) => (
              <Link
                key={c.id}
                href={buildShopsHref({
                  city: BETA_CITY_NAME,
                  categories: String(c.id),
                  bookingDate,
                })}
                className="inline-flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:shadow-sm"
              >
                <span>{iconForCategory(c.slug)}</span>
                <span>{c.name}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* TOP SHOPS — all active shops, highest rated first. */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">Top shops</h2>
          <Link
            href={buildShopsHref({ city: BETA_CITY_NAME })}
            className="text-sm font-semibold text-brand-600 hover:text-brand-700"
          >
            Explore all
          </Link>
        </div>
        {topShopsLoading ? (
          <ShopGridSkeleton />
        ) : topShops.length === 0 ? (
          <EmptySectionState
            message="No active shops yet."
            ctaLabel="List your shop"
            ctaHref="/register"
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {topShops.map((shop) => (
              <Link
                key={shop.id}
                href={`/shops/${shop.id}`}
                className="block overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md"
              >
                {shop.cover_photo ? (
                  <img
                    src={shop.cover_photo}
                    alt={shop.name}
                    className="h-44 w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-44 w-full items-center justify-center bg-gradient-to-br from-brand-100 to-brand-50 text-3xl">
                    🏪
                  </div>
                )}
                <div className="space-y-1 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-semibold text-slate-900">
                      {shop.name}
                    </h3>
                    {typeof shop.avg_rating === "number" && (
                      <span className="inline-flex shrink-0 items-center gap-1 text-sm text-slate-700">
                        <Star size={14} className="fill-amber-400 text-amber-400" />
                        {shop.avg_rating.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500">{shop.city}</p>
                  {shop.categories && shop.categories.length > 0 && (
                    <p className="truncate text-xs text-slate-400">
                      {shop.categories.map((c) => c.name).join(" · ")}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* AVAILABLE SERVICES — all active services, highest-rated shop first. */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">
            Available services
          </h2>
          <Link
            href={buildServicesHref({ city: BETA_CITY_NAME, bookingDate })}
            className="text-sm font-semibold text-brand-600 hover:text-brand-700"
          >
            Browse all services
          </Link>
        </div>
        {topServicesLoading ? (
          <ServiceGridSkeleton />
        ) : topServices.length === 0 ? (
          <EmptySectionState
            message="No services available yet."
            ctaLabel="List your shop"
            ctaHref="/register"
          />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {topServices.map((service) => (
              <Link
                key={service.id}
                href={`/shops/${service.shop_id}/book?service=${service.id}`}
                className="block space-y-3"
              >
                <div className="overflow-hidden rounded-2xl bg-slate-100">
                  {service.cover_photo ? (
                    <img
                      src={service.cover_photo}
                      alt={service.name}
                      className="h-56 w-full object-cover transition hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-56 w-full items-center justify-center bg-gradient-to-br from-brand-100 to-brand-50 text-4xl">
                      ✨
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">
                      {service.name}
                    </h3>
                    {typeof service.shop_avg_rating === "number" && (
                      <span className="inline-flex shrink-0 items-center gap-1 text-sm text-slate-700">
                        <Star size={14} className="fill-amber-400 text-amber-400" />
                        {service.shop_avg_rating.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500">
                    {service.shop_name} · {service.duration_minutes} min
                  </p>
                  <p className="text-sm font-semibold text-slate-900">
                    PHP {service.price}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-3xl bg-slate-900 px-6 py-8 text-white sm:px-10">
        <h2 className="text-2xl font-semibold">List your shop on BookMe</h2>
        <p className="mt-2 max-w-xl text-sm text-slate-200 sm:text-base">
          Join local businesses already growing with online reservations, reminders, and reviews.
        </p>
        <Link
          href="/register"
          className="mt-5 inline-flex rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
        >
          Get started
        </Link>
      </section>
    </div>
  );
}

function ShopGridSkeleton() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200"
          aria-hidden="true"
        >
          <div className="h-44 w-full animate-pulse bg-slate-100" />
          <div className="space-y-2 p-4">
            <div className="h-4 w-3/4 animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-2/5 animate-pulse rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ServiceGridSkeleton() {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-3" aria-hidden="true">
          <div className="h-56 w-full animate-pulse rounded-2xl bg-slate-100" />
          <div className="space-y-2">
            <div className="h-4 w-3/4 animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptySectionState({
  message,
  ctaLabel,
  ctaHref,
}: {
  message: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
      <p className="text-sm font-medium text-slate-700">{message}</p>
      <Link
        href={ctaHref}
        className="mt-2 inline-block text-sm font-medium text-brand-600 hover:text-brand-700"
      >
        {ctaLabel}
      </Link>
    </div>
  );
}
