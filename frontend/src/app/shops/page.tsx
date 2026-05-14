"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MapPin, Search, X } from "lucide-react";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/errors";
import { Pagination } from "@/components/Pagination";
import { ShopCard, ShopCardData } from "@/components/ShopCard";

const PAGE_SIZE = 12;
const SEARCH_DEBOUNCE_MS = 350;

type Paginated<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

type NearbyShop = ShopCardData & { distance_km?: number };

function ShopsPageInner() {
  const router = useRouter();
  const params = useSearchParams();

  const isNearbyMode = params.get("nearby") === "1";

  const [shops, setShops] = useState<ShopCardData[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<string | null>(null);

  const [query, setQuery] = useState(params.get("q") ?? "");
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [page, setPage] = useState(() => {
    const raw = Number(params.get("page"));
    return Number.isFinite(raw) && raw > 0 ? raw : 1;
  });

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery]);

  // Keep URL in sync for back/forward nav and shareable links.
  useEffect(() => {
    if (isNearbyMode) return;
    const sp = new URLSearchParams();
    if (debouncedQuery.trim()) sp.set("q", debouncedQuery.trim());
    if (page > 1) sp.set("page", String(page));
    const qs = sp.toString();
    router.replace(qs ? `/shops?${qs}` : "/shops", { scroll: false });
  }, [debouncedQuery, page, isNearbyMode, router]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<Paginated<ShopCardData>>("/shops/", {
        params: {
          search: debouncedQuery.trim() || undefined,
          page,
          page_size: PAGE_SIZE,
        },
      });
      setShops(data.results);
      setTotalCount(data.count);
    } catch (err) {
      setError(formatApiError(err, "Failed to load shops."));
      setShops([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, page]);

  const requestNearby = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setLocationStatus("Geolocation not supported. Showing all shops.");
      router.replace("/shops");
      return;
    }
    setLocationStatus("Requesting your location…");
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLocationStatus(null);
        try {
          const { data } = await api.get<NearbyShop[]>("/shops/nearby/", {
            params: {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              radius_km: 10,
            },
          });
          setShops(data);
          setTotalCount(data.length);
          router.replace("/shops?nearby=1", { scroll: false });
        } catch (err) {
          setError(formatApiError(err, "Failed to load nearby shops."));
        } finally {
          setLoading(false);
        }
      },
      () => {
        setLocationStatus("Location denied. Showing all shops — try entering a city below.");
        setLoading(false);
        router.replace("/shops");
      },
      { timeout: 10_000 }
    );
  }, [router]);

  useEffect(() => {
    if (isNearbyMode) {
      requestNearby();
    } else {
      loadAll();
    }
  }, [isNearbyMode, loadAll, requestNearby]);

  const hasActiveFilter = debouncedQuery.trim().length > 0;
  const showPagination = !isNearbyMode && totalCount > PAGE_SIZE;

  function clearNearby() {
    setLocationStatus(null);
    router.replace("/shops");
  }

  return (
    <div className="space-y-6 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Browse shops</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Discover local shops near you and book in seconds.
          </p>
        </div>
        {!isNearbyMode && (
          <button
            onClick={requestNearby}
            className="inline-flex items-center gap-1.5 self-start rounded-md border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50"
          >
            <MapPin size={16} className="text-slate-500" />
            Find shops near me
          </button>
        )}
      </div>

      {!isNearbyMode && (
        <div className="relative">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or city"
            aria-label="Search shops"
            className="w-full rounded-full border border-slate-300 bg-white py-2.5 pl-10 pr-10 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {isNearbyMode && !loading && (
        <div className="flex flex-col gap-2 rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-brand-900">
            <MapPin size={14} className="mr-1 inline-block" />
            Showing {totalCount} shop{totalCount === 1 ? "" : "s"} within 10 km of your location.
          </p>
          <button
            type="button"
            onClick={clearNearby}
            className="self-start text-sm font-medium text-brand-700 hover:text-brand-800 sm:self-auto"
          >
            Show all shops
          </button>
        </div>
      )}

      {locationStatus && <p className="text-sm text-slate-600">{locationStatus}</p>}

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-700">
          {error}
        </p>
      ) : loading && shops.length === 0 ? (
        <ShopGridSkeleton />
      ) : shops.length === 0 ? (
        <EmptyState
          hasActiveFilter={hasActiveFilter}
          isNearbyMode={isNearbyMode}
          onClearSearch={() => setQuery("")}
          onClearNearby={clearNearby}
        />
      ) : (
        <>
          {!isNearbyMode && totalCount > 0 && (
            <p className="text-sm text-slate-500">
              {totalCount} shop{totalCount === 1 ? "" : "s"}
              {hasActiveFilter ? ` matching "${debouncedQuery.trim()}"` : ""}
            </p>
          )}
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {shops.map((shop) => (
              <ShopCard
                key={shop.id}
                shop={shop}
                href={`/shops/${shop.id}`}
                cta="View"
              />
            ))}
          </ul>
        </>
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
          unitLabel="shops"
        />
      )}
    </div>
  );
}

function ShopGridSkeleton() {
  return (
    <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <li
          key={i}
          className="overflow-hidden rounded-lg bg-white shadow-sm"
          aria-hidden="true"
        >
          <div className="aspect-[4/3] w-full animate-pulse bg-slate-100" />
          <div className="space-y-2 p-4">
            <div className="h-4 w-3/4 animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyState({
  hasActiveFilter,
  isNearbyMode,
  onClearSearch,
  onClearNearby,
}: {
  hasActiveFilter: boolean;
  isNearbyMode: boolean;
  onClearSearch: () => void;
  onClearNearby: () => void;
}) {
  let message = "No shops yet. Check back soon!";
  if (isNearbyMode) {
    message = "No shops within 10 km of your location.";
  } else if (hasActiveFilter) {
    message = "No shops match your search.";
  }

  return (
    <div className="rounded-lg border border-dashed border-slate-200 bg-white p-10 text-center">
      <p className="text-sm font-medium text-slate-700">{message}</p>
      {isNearbyMode ? (
        <button
          type="button"
          onClick={onClearNearby}
          className="mt-2 text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          Show all shops
        </button>
      ) : hasActiveFilter ? (
        <button
          type="button"
          onClick={onClearSearch}
          className="mt-2 text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          Clear search
        </button>
      ) : null}
    </div>
  );
}

export default function ShopsPage() {
  return (
    <Suspense fallback={<p className="py-6 text-sm text-slate-500">Loading shops…</p>}>
      <ShopsPageInner />
    </Suspense>
  );
}
