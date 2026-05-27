"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Calendar,
  ChevronDown,
  LayoutGrid,
  List,
  MapPin,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Star,
  Store,
  Tag,
  Users,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/errors";
import { Pagination } from "@/components/Pagination";
import { ShopCard, ShopCardData } from "@/components/ShopCard";
import { ShopListRow } from "@/components/ShopListRow";

const PAGE_SIZE = 12;
const SEARCH_DEBOUNCE_MS = 350;

type Paginated<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

type NearbyShop = ShopCardData & { distance_km?: number };
type ViewMode = "grid" | "list";
type ShopCategory = { id: number; name: string; slug: string };

const SORT_OPTIONS: { value: string; label: string; ordering: string }[] = [
  { value: "", label: "Recommended", ordering: "-created_at" },
  { value: "name", label: "Name (A-Z)", ordering: "name" },
  { value: "-name", label: "Name (Z-A)", ordering: "-name" },
  { value: "-avg_rating", label: "Highest rated", ordering: "-avg_rating" },
  { value: "-reviews_count", label: "Most reviewed", ordering: "-reviews_count" },
];

const RATING_OPTIONS: { value: string; label: string }[] = [
  { value: "4", label: "4★ & up" },
  { value: "4.5", label: "4.5★ & up" },
];

// Today (YYYY-MM-DD in local time) — guards the date picker so customers
// cannot ask for shops "available yesterday".
function todayIso() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

function orderingFor(sortValue: string): string {
  return (
    SORT_OPTIONS.find((o) => o.value === sortValue)?.ordering ?? "-created_at"
  );
}

function ShopsPageInner() {
  const router = useRouter();
  const params = useSearchParams();

  const isNearbyMode = params.get("nearby") === "1";

  // Filter state — initialized from URL so back/forward and shareable links work.
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [city, setCity] = useState(params.get("city") ?? "");
  const [bookingDate, setBookingDate] = useState(params.get("booking_date") ?? "");
  const [guests, setGuests] = useState(() => {
    const raw = Number(params.get("guests"));
    return Number.isFinite(raw) && raw > 0 ? raw : 1;
  });
  const [sort, setSort] = useState(params.get("sort") ?? "");
  const [view, setView] = useState<ViewMode>(
    params.get("view") === "list" ? "list" : "grid"
  );
  const initialCategoryIds = useMemo(
    () =>
      (params.get("categories") ?? "")
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0),
    // We intentionally read from `params` only on mount; later updates are
    // driven by setSelectedCategories so we don't replay URL state on every
    // navigation change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [selectedCategories, setSelectedCategories] =
    useState<number[]>(initialCategoryIds);
  const [minRating, setMinRating] = useState(params.get("min_rating") ?? "");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [page, setPage] = useState(() => {
    const raw = Number(params.get("page"));
    return Number.isFinite(raw) && raw > 0 ? raw : 1;
  });

  const [shops, setShops] = useState<ShopCardData[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<string | null>(null);
  const [cities, setCities] = useState<string[]>([]);
  const [categories, setCategories] = useState<ShopCategory[]>([]);

  // Debounce the text search.
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  // Any filter change resets to page 1.
  useEffect(() => {
    setPage(1);
  }, [
    debouncedQuery,
    city,
    bookingDate,
    guests,
    sort,
    selectedCategories,
    minRating,
  ]);

  // Load the city + category dropdowns once on mount — tiny payloads.
  useEffect(() => {
    let cancelled = false;
    api
      .get<string[]>("/shops/cities/")
      .then((r) => {
        if (!cancelled) setCities(r.data ?? []);
      })
      .catch(() => undefined);
    api
      .get("/shops/categories/")
      .then((r) => {
        if (cancelled) return;
        const raw = (r.data?.results ?? r.data ?? []) as ShopCategory[];
        setCategories(raw);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep URL in sync.
  useEffect(() => {
    if (isNearbyMode) return;
    const sp = new URLSearchParams();
    if (debouncedQuery.trim()) sp.set("q", debouncedQuery.trim());
    if (city) sp.set("city", city);
    if (bookingDate) sp.set("booking_date", bookingDate);
    if (guests > 1) sp.set("guests", String(guests));
    if (sort) sp.set("sort", sort);
    if (selectedCategories.length > 0)
      sp.set("categories", selectedCategories.join(","));
    if (minRating) sp.set("min_rating", minRating);
    if (view !== "grid") sp.set("view", view);
    if (page > 1) sp.set("page", String(page));
    const qs = sp.toString();
    router.replace(qs ? `/shops?${qs}` : "/shops", { scroll: false });
  }, [
    debouncedQuery,
    city,
    bookingDate,
    guests,
    sort,
    selectedCategories,
    minRating,
    view,
    page,
    isNearbyMode,
    router,
  ]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<Paginated<ShopCardData>>("/shops/", {
        params: {
          search: debouncedQuery.trim() || undefined,
          city: city || undefined,
          booking_date: bookingDate || undefined,
          guests: guests > 1 ? guests : undefined,
          categories:
            selectedCategories.length > 0
              ? selectedCategories.join(",")
              : undefined,
          min_rating: minRating || undefined,
          ordering: orderingFor(sort),
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
  }, [
    debouncedQuery,
    city,
    bookingDate,
    guests,
    sort,
    selectedCategories,
    minRating,
    page,
  ]);

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

  const hasActiveFilter = useMemo(
    () =>
      Boolean(
        debouncedQuery.trim() ||
          city ||
          bookingDate ||
          guests > 1 ||
          sort ||
          selectedCategories.length > 0 ||
          minRating
      ),
    [
      debouncedQuery,
      city,
      bookingDate,
      guests,
      sort,
      selectedCategories,
      minRating,
    ]
  );
  const activeFilterCount =
    (debouncedQuery.trim() ? 1 : 0) +
    (city ? 1 : 0) +
    (bookingDate ? 1 : 0) +
    (guests > 1 ? 1 : 0) +
    selectedCategories.length +
    (minRating ? 1 : 0);
  const showPagination = !isNearbyMode && totalCount > PAGE_SIZE;

  function clearNearby() {
    setLocationStatus(null);
    router.replace("/shops");
  }

  function resetFilters() {
    setQuery("");
    setCity("");
    setBookingDate("");
    setGuests(1);
    setSort("");
    setSelectedCategories([]);
    setMinRating("");
  }

  function toggleCategory(id: number) {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  return (
    <div className="py-4">
      {/* HEADER */}
      <div className="mb-5">
        <h1 className="text-3xl font-bold text-slate-900">Browse shops</h1>
        <p className="mt-1 text-sm text-slate-500">
          Discover local shops near you and book in seconds.
        </p>
      </div>

      {/* NEARBY MODE BANNER */}
      {isNearbyMode && !loading && (
        <div className="mb-4 flex flex-col gap-2 rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
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

      {locationStatus && (
        <p className="mb-4 text-sm text-slate-600">{locationStatus}</p>
      )}

      {/* MOBILE FILTERS TOGGLE — sidebar is full-width on mobile, hidden by default. */}
      {!isNearbyMode && (
        <button
          type="button"
          onClick={() => setMobileFiltersOpen((v) => !v)}
          aria-expanded={mobileFiltersOpen}
          className="mb-3 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 lg:hidden"
        >
          <SlidersHorizontal size={16} />
          Filters
          {activeFilterCount > 0 && (
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold text-white">
              {activeFilterCount}
            </span>
          )}
        </button>
      )}

      {/* MAIN GRID: sidebar + results */}
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* SIDEBAR */}
        {!isNearbyMode && (
          <aside
            className={`${
              mobileFiltersOpen ? "block" : "hidden"
            } lg:block`}
          >
            <FilterSidebar
              query={query}
              onQueryChange={setQuery}
              bookingDate={bookingDate}
              onBookingDateChange={setBookingDate}
              guests={guests}
              onGuestsChange={setGuests}
              city={city}
              onCityChange={setCity}
              cities={cities}
              categories={categories}
              selectedCategories={selectedCategories}
              onToggleCategory={toggleCategory}
              minRating={minRating}
              onMinRatingChange={setMinRating}
              canReset={hasActiveFilter}
              onReset={resetFilters}
              onApply={() => {
                setMobileFiltersOpen(false);
                loadAll();
              }}
            />
          </aside>
        )}

        {/* MAIN */}
        <main className="min-w-0 space-y-4">
          {/* RESULTS HEADER (count + sort + grid/list toggle) */}
          {!error && !isNearbyMode && (
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-600">
                <span className="font-semibold text-slate-900">{totalCount}</span>{" "}
                shop{totalCount === 1 ? "" : "s"} found
              </p>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <span className="text-slate-500">Sort by</span>
                  <div className="relative">
                    <select
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                      aria-label="Sort shops"
                      className="appearance-none rounded-lg border border-slate-200 bg-white py-1.5 pl-3 pr-8 text-sm font-medium text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    >
                      {SORT_OPTIONS.map((o) => (
                        <option key={o.value || "recommended"} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={14}
                      className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                  </div>
                </label>
                <ViewToggle view={view} onChange={setView} />
              </div>
            </div>
          )}

          {/* RESULTS */}
          {error ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-700">
              {error}
            </p>
          ) : loading && shops.length === 0 ? (
            view === "list" ? <ShopListSkeleton /> : <ShopGridSkeleton />
          ) : shops.length === 0 ? (
            <EmptyState
              hasActiveFilter={hasActiveFilter}
              isNearbyMode={isNearbyMode}
              onReset={resetFilters}
              onClearNearby={clearNearby}
            />
          ) : view === "list" ? (
            <ul className="space-y-4">
              {shops.map((shop) => (
                <ShopListRow key={shop.id} shop={shop} href={`/shops/${shop.id}`} />
              ))}
            </ul>
          ) : (
            <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {shops.map((shop) => (
                <ShopCard key={shop.id} shop={shop} href={`/shops/${shop.id}`} />
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
              unitLabel="shops"
            />
          )}
        </main>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Left-rail filter sidebar.
 *
 * All sections are visible at once (no accordions): the filters are short
 * enough that hiding them just creates an extra click. A single solid Apply
 * button forces a fresh fetch — useful on mobile where the auto-applied URL
 * sync isn't visible — and a Reset link clears everything.
 * ------------------------------------------------------------------------- */

function FilterSidebar({
  query,
  onQueryChange,
  bookingDate,
  onBookingDateChange,
  guests,
  onGuestsChange,
  city,
  onCityChange,
  cities,
  categories,
  selectedCategories,
  onToggleCategory,
  minRating,
  onMinRatingChange,
  canReset,
  onReset,
  onApply,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  bookingDate: string;
  onBookingDateChange: (v: string) => void;
  guests: number;
  onGuestsChange: (n: number) => void;
  city: string;
  onCityChange: (v: string) => void;
  cities: string[];
  categories: ShopCategory[];
  selectedCategories: number[];
  onToggleCategory: (id: number) => void;
  minRating: string;
  onMinRatingChange: (v: string) => void;
  canReset: boolean;
  onReset: () => void;
  onApply: () => void;
}) {
  const minDate = todayIso();
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-4">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">Filters</h2>

      <FilterSection icon={Store} label="Shop name">
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search shop name"
            aria-label="Search shops"
            className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-8 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </FilterSection>

      <FilterSection icon={Calendar} label="When">
        <input
          type="date"
          value={bookingDate}
          min={minDate}
          onChange={(e) => onBookingDateChange(e.target.value)}
          aria-label="Booking date"
          className={`h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 ${
            bookingDate ? "text-slate-900" : "text-slate-400"
          }`}
        />
      </FilterSection>

      <FilterSection icon={Users} label="Guests">
        <select
          value={guests}
          onChange={(e) => onGuestsChange(Number(e.target.value))}
          aria-label="Number of guests"
          className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 pr-8 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 12px center",
            backgroundSize: "12px",
          }}
        >
          {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n === 1 ? "1 guest" : `${n} guests`}
            </option>
          ))}
        </select>
      </FilterSection>

      <FilterSection icon={MapPin} label="City">
        <select
          value={city}
          onChange={(e) => onCityChange(e.target.value)}
          aria-label="Filter by city"
          className={`h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 pr-8 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 ${
            city ? "text-slate-900" : "text-slate-400"
          }`}
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 12px center",
            backgroundSize: "12px",
          }}
        >
          <option value="">All cities</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </FilterSection>

      <FilterSection icon={Tag} label="Category">
        {categories.length === 0 ? (
          <p className="text-sm text-slate-400">No categories available.</p>
        ) : (
          <ul className="space-y-2">
            {categories.map((c) => {
              const active = selectedCategories.includes(c.id);
              return (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => onToggleCategory(c.id)}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span>{c.name}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </FilterSection>

      <FilterSection icon={Star} label="Rating" last>
        <ul className="space-y-2">
          {RATING_OPTIONS.map((o) => {
            const active = minRating === o.value;
            return (
              <li key={o.value}>
                <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => onMinRatingChange(active ? "" : o.value)}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="inline-flex items-center gap-1">
                    {o.label}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </FilterSection>

      <div className="mt-5 space-y-2">
        <button
          type="button"
          onClick={onApply}
          className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
        >
          Apply filters
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={!canReset}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RotateCcw size={14} />
          Reset
        </button>
      </div>
    </div>
  );
}

function FilterSection({
  icon: Icon,
  label,
  last = false,
  children,
}: {
  icon: typeof Store;
  label: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={last ? "" : "mb-4"}>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
        <Icon size={14} className="text-brand-600" />
        {label}
      </div>
      {children}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * View toggle (grid / list)
 * ------------------------------------------------------------------------- */

function ViewToggle({
  view,
  onChange,
}: {
  view: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Toggle view"
      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1"
    >
      <ToggleButton
        active={view === "grid"}
        onClick={() => onChange("grid")}
        label="Grid view"
      >
        <LayoutGrid size={16} />
      </ToggleButton>
      <ToggleButton
        active={view === "list"}
        onClick={() => onChange("list")}
        label="List view"
      >
        <List size={16} />
      </ToggleButton>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${
        active ? "bg-brand-600 text-white" : "text-slate-500 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

/* ----------------------------------------------------------------------------
 * Loading / empty states
 * ------------------------------------------------------------------------- */

function ShopGridSkeleton() {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <li
          key={i}
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          aria-hidden="true"
        >
          <div className="aspect-[4/3] w-full animate-pulse bg-slate-100" />
          <div className="space-y-3 p-5">
            <div className="h-5 w-3/4 animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-2/5 animate-pulse rounded bg-slate-100" />
            <div className="mt-2 h-9 w-full animate-pulse rounded bg-slate-50" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ShopListSkeleton() {
  return (
    <ul className="space-y-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <li
          key={i}
          className="flex overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          aria-hidden="true"
        >
          <div className="h-32 w-48 flex-shrink-0 animate-pulse bg-slate-100" />
          <div className="flex-1 space-y-2 p-5">
            <div className="h-4 w-1/3 animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-1/4 animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-1/5 animate-pulse rounded bg-slate-100" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyState({
  hasActiveFilter,
  isNearbyMode,
  onReset,
  onClearNearby,
}: {
  hasActiveFilter: boolean;
  isNearbyMode: boolean;
  onReset: () => void;
  onClearNearby: () => void;
}) {
  let message = "No shops yet. Check back soon!";
  if (isNearbyMode) {
    message = "No shops within 10 km of your location.";
  } else if (hasActiveFilter) {
    message = "No shops match your filters.";
  }

  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
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
          onClick={onReset}
          className="mt-2 text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          Reset filters
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
