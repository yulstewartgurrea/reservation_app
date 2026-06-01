"use client";

/**
 * Customer-facing services panel for the public shop detail page.
 *
 * Owns search + sort + pagination state and fetches `/services/?shop=…` with
 * the matching query params. The search input is debounced (350ms) so the
 * user can type freely without triggering a request per keystroke. Any
 * filter/sort change resets to page 1 so the user never lands on an empty
 * page after a query narrows the result set.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/errors";
import { Pagination } from "@/components/Pagination";
import { PublicServiceCard, PublicServiceHit } from "@/components/PublicServiceCard";

const PAGE_SIZE = 8;
const SEARCH_DEBOUNCE_MS = 350;

type SortKey = "name-asc" | "price-asc" | "price-desc" | "duration-asc";

const ORDERING: Record<SortKey, string> = {
  "name-asc": "name",
  "price-asc": "price",
  "price-desc": "-price",
  "duration-asc": "duration_minutes",
};

type ServiceRow = {
  id: number;
  name: string;
  duration_minutes: number;
  price: string;
  cover_photo: string | null;
  category_detail?: { id: number; name: string } | null;
};

type Paginated<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export function PublicServicesPanel({
  shopId,
  shopName,
  shopCity,
}: {
  shopId: number;
  shopName: string;
  shopCity: string;
}) {
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("name-asc");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, sort]);

  const listParams = useMemo(() => {
    const params: Record<string, string | number> = {
      shop: shopId,
      page,
      page_size: PAGE_SIZE,
      ordering: ORDERING[sort],
    };
    const trimmed = debouncedQuery.trim();
    if (trimmed) params.search = trimmed;
    return params;
  }, [shopId, page, debouncedQuery, sort]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<Paginated<ServiceRow>>("/services/", {
        params: listParams,
      });
      setServices(res.data.results);
      setTotalCount(res.data.count);
    } catch (err) {
      setError(formatApiError(err, "Failed to load services."));
    } finally {
      setLoading(false);
    }
  }, [listParams]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const hasActiveFilter = debouncedQuery.trim().length > 0;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-slate-900">Services</h2>
        <p className="text-sm text-slate-500">Pick a service to book.</p>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search services…"
            aria-label="Search services"
            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-9 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={14} />
            </button>
          )}
        </label>

        <label className="sm:w-48">
          <span className="sr-only">Sort services</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            <option value="name-asc">Name (A–Z)</option>
            <option value="price-asc">Price (low → high)</option>
            <option value="price-desc">Price (high → low)</option>
            <option value="duration-asc">Shortest first</option>
          </select>
        </label>
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-700">
          {error}
        </p>
      ) : loading && services.length === 0 ? (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <li
              key={i}
              className="overflow-hidden rounded-2xl bg-white shadow-sm"
            >
              <div className="aspect-[4/3] w-full animate-pulse bg-slate-100" />
              <div className="space-y-2 px-4 py-3">
                <div className="h-4 w-3/4 animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
              </div>
            </li>
          ))}
        </ul>
      ) : services.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
          <p className="text-sm font-medium text-slate-700">
            {hasActiveFilter ? "No services match your search." : "No services yet."}
          </p>
          {hasActiveFilter && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="mt-2 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              Clear search
            </button>
          )}
        </div>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {services.map((s) => (
            <PublicServiceCard
              key={s.id}
              hideShop
              service={{
                id: s.id,
                name: s.name,
                duration_minutes: s.duration_minutes,
                price: s.price,
                cover_photo: s.cover_photo,
                shop_id: shopId,
                shop_name: shopName,
                shop_city: shopCity,
                category: s.category_detail?.name ?? null,
              }}
            />
          ))}
        </ul>
      )}

      <div className="mt-5">
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={totalCount}
          onPageChange={setPage}
          unitLabel="services"
        />
      </div>
    </section>
  );
}
