"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/errors";
import { Pagination } from "@/components/Pagination";
import { PublicServiceCard, PublicServiceHit } from "@/components/PublicServiceCard";

const PAGE_SIZE = 12;
const SEARCH_DEBOUNCE_MS = 350;

type Category = { id: number; name: string };

type Paginated<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

function ServiceSearchInner() {
  const router = useRouter();
  const params = useSearchParams();

  const [q, setQ] = useState(params.get("q") ?? "");
  const [city, setCity] = useState(params.get("city") ?? "");
  const [category, setCategory] = useState<string>(params.get("category") ?? "");
  const [debouncedQ, setDebouncedQ] = useState(q);
  const [debouncedCity, setDebouncedCity] = useState(city);

  const [categories, setCategories] = useState<Category[]>([]);
  const [results, setResults] = useState<PublicServiceHit[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(() => {
    const raw = Number(params.get("page"));
    return Number.isFinite(raw) && raw > 0 ? raw : 1;
  });

  useEffect(() => {
    api
      .get("/services/categories/")
      .then((r) => setCategories(r.data.results ?? r.data))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedQ(q);
      setDebouncedCity(city);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [q, city]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, debouncedCity, category]);

  const fetchPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<Paginated<PublicServiceHit>>(
        "/services/discover/",
        {
          params: {
            q: debouncedQ.trim() || undefined,
            city: debouncedCity.trim() || undefined,
            category: category || undefined,
            page,
            page_size: PAGE_SIZE,
          },
        }
      );
      setResults(data.results);
      setTotalCount(data.count);
    } catch (err) {
      setError(formatApiError(err, "Failed to load services."));
      setResults([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, debouncedCity, category, page]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  useEffect(() => {
    const sp = new URLSearchParams();
    if (debouncedQ.trim()) sp.set("q", debouncedQ.trim());
    if (debouncedCity.trim()) sp.set("city", debouncedCity.trim());
    if (category) sp.set("category", category);
    if (page > 1) sp.set("page", String(page));
    const qs = sp.toString();
    router.replace(qs ? `/services?${qs}` : "/services", { scroll: false });
  }, [debouncedQ, debouncedCity, category, page, router]);

  const hasActiveFilter =
    debouncedQ.trim().length > 0 || debouncedCity.trim().length > 0 || !!category;

  function clearFilters() {
    setQ("");
    setCity("");
    setCategory("");
  }

  const showPagination = totalCount > PAGE_SIZE;

  return (
    <div className="space-y-6 py-4">
      <div>
        <h1 className="text-2xl font-semibold">Find a service</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Browse services across all active shops.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Service name (haircut, massage, …)"
            aria-label="Search services"
            className="w-full rounded-full border border-slate-300 bg-white py-2.5 pl-10 pr-10 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="City"
          aria-label="Filter by city"
          className="rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Filter by category"
          className="rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {hasActiveFilter && (
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            Clear filters
          </button>
        )}
      </div>

      {!loading && totalCount > 0 && (
        <p className="text-sm text-slate-500">
          {totalCount} service{totalCount === 1 ? "" : "s"}
          {hasActiveFilter ? " matching your filters" : ""}
        </p>
      )}

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-700">
          {error}
        </p>
      ) : loading && results.length === 0 ? (
        <ServiceGridSkeleton />
      ) : results.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white p-10 text-center">
          <p className="text-sm font-medium text-slate-700">
            {hasActiveFilter ? "No services match your filters." : "No services yet."}
          </p>
          {hasActiveFilter && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-2 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {results.map((s) => (
            <PublicServiceCard key={s.id} service={s} />
          ))}
        </ul>
      )}

      {showPagination && (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={totalCount}
          onPageChange={(next) => {
            setPage(next);
            if (typeof window !== "undefined") {
              window.scrollTo({ top: 0, behavior: "smooth" });
            }
          }}
          unitLabel="services"
        />
      )}
    </div>
  );
}

function ServiceGridSkeleton() {
  return (
    <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <li
          key={i}
          className="overflow-hidden rounded-2xl bg-white shadow-sm"
          aria-hidden="true"
        >
          <div className="aspect-[4/3] w-full animate-pulse bg-slate-100" />
          <div className="space-y-2 px-4 py-3">
            <div className="h-4 w-3/4 animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function ServiceSearchPage() {
  return (
    <Suspense fallback={<p className="py-6 text-sm text-slate-500">Loading services…</p>}>
      <ServiceSearchInner />
    </Suspense>
  );
}
