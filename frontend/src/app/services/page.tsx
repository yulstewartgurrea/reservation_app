"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Calendar,
  LayoutGrid,
  List,
  MapPin,
  RotateCcw,
  Search,
  Star,
  Store,
  Tag,
  Users,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/errors";
import { Pagination } from "@/components/Pagination";
import { PublicServiceCard, PublicServiceHit } from "@/components/PublicServiceCard";

const PAGE_SIZE = 12;
const SEARCH_DEBOUNCE_MS = 350;

type Category = { id: number; name: string };
type ViewMode = "grid" | "list";

type Paginated<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Recommended" },
  { value: "name", label: "Name (A-Z)" },
  { value: "-name", label: "Name (Z-A)" },
  { value: "-shop_avg_rating", label: "Highest rated" },
  { value: "-shop_reviews_count", label: "Most reviewed" },
];

const RATING_OPTIONS: { value: string; label: string }[] = [
  { value: "4", label: "4★ & up" },
  { value: "4.5", label: "4.5★ & up" },
];

// Today (YYYY-MM-DD in local time) — clamps the date picker's `min` so
// customers cannot ask for "services available yesterday". Mirrors /shops.
function todayIso() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

function ServiceSearchInner() {
  const router = useRouter();
  const params = useSearchParams();

  // Filter state — initialized from URL so shareable links and back/forward work.
  const [q, setQ] = useState(params.get("q") ?? "");
  const [debouncedQ, setDebouncedQ] = useState(q);
  const [city, setCity] = useState(params.get("city") ?? "");
  const initialCategoryIds = useMemo(
    () =>
      (params.get("category") ?? "")
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0),
    // Read once on mount; subsequent changes are driven by setSelectedCategories.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [selectedCategories, setSelectedCategories] =
    useState<number[]>(initialCategoryIds);
  const [bookingDate, setBookingDate] = useState(params.get("booking_date") ?? "");
  const [guests, setGuests] = useState(() => {
    const raw = Number(params.get("guests"));
    return Number.isFinite(raw) && raw > 0 ? raw : 1;
  });
  const [minRating, setMinRating] = useState(params.get("min_rating") ?? "");
  const [sort, setSort] = useState(params.get("sort") ?? "");
  const [view, setView] = useState<ViewMode>(
    params.get("view") === "list" ? "list" : "grid"
  );
  const [page, setPage] = useState(() => {
    const raw = Number(params.get("page"));
    return Number.isFinite(raw) && raw > 0 ? raw : 1;
  });

  const [categories, setCategories] = useState<Category[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [results, setResults] = useState<PublicServiceHit[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reference data: categories + distinct shop cities. Both small, fetched once.
  useEffect(() => {
    api
      .get("/services/categories/")
      .then((r) => setCategories(r.data.results ?? r.data))
      .catch(() => undefined);
    api
      .get<string[]>("/shops/cities/")
      .then((r) => setCities(r.data ?? []))
      .catch(() => undefined);
  }, []);

  // Debounce the text search.
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQ(q), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [q]);

  // Any filter change resets to page 1.
  useEffect(() => {
    setPage(1);
  }, [
    debouncedQ,
    city,
    selectedCategories,
    bookingDate,
    guests,
    minRating,
    sort,
  ]);

  const fetchPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<Paginated<PublicServiceHit>>(
        "/services/discover/",
        {
          params: {
            q: debouncedQ.trim() || undefined,
            city: city || undefined,
            category:
              selectedCategories.length > 0
                ? selectedCategories.join(",")
                : undefined,
            booking_date: bookingDate || undefined,
            guests: guests > 1 ? guests : undefined,
            min_rating: minRating || undefined,
            ordering: sort || undefined,
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
  }, [
    debouncedQ,
    city,
    selectedCategories,
    bookingDate,
    guests,
    minRating,
    sort,
    page,
  ]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  // Keep URL in sync.
  useEffect(() => {
    const sp = new URLSearchParams();
    if (debouncedQ.trim()) sp.set("q", debouncedQ.trim());
    if (city) sp.set("city", city);
    if (selectedCategories.length > 0)
      sp.set("category", selectedCategories.join(","));
    if (bookingDate) sp.set("booking_date", bookingDate);
    if (guests > 1) sp.set("guests", String(guests));
    if (minRating) sp.set("min_rating", minRating);
    if (sort) sp.set("sort", sort);
    if (view !== "grid") sp.set("view", view);
    if (page > 1) sp.set("page", String(page));
    const qs = sp.toString();
    router.replace(qs ? `/services?${qs}` : "/services", { scroll: false });
  }, [
    debouncedQ,
    city,
    selectedCategories,
    bookingDate,
    guests,
    minRating,
    sort,
    view,
    page,
    router,
  ]);

  const hasActiveFilter = useMemo(
    () =>
      debouncedQ.trim().length > 0 ||
      city.length > 0 ||
      selectedCategories.length > 0 ||
      bookingDate.length > 0 ||
      guests > 1 ||
      minRating.length > 0 ||
      sort.length > 0,
    [debouncedQ, city, selectedCategories, bookingDate, guests, minRating, sort]
  );

  function toggleCategory(id: number) {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function resetFilters() {
    setQ("");
    setCity("");
    setSelectedCategories([]);
    setBookingDate("");
    setGuests(1);
    setMinRating("");
    setSort("");
  }

  const showPagination = totalCount > PAGE_SIZE;

  return (
    <div className="space-y-5 py-4">
      {/* HEADER */}
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Find a service</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Browse services across all active shops.
          </p>
        </div>
        <HeaderDecoration />
      </header>

      {/* MAIN — sidebar (filters) + content (results). Stacks on mobile. */}
      <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <FiltersSidebar
          q={q}
          onQChange={setQ}
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
        />

        <div className="min-w-0 space-y-5">
          {/* TOP BAR — count + sort + view toggle */}
          <ResultsTopBar
            totalCount={totalCount}
            loading={loading}
            sort={sort}
            onSortChange={setSort}
            view={view}
            onViewChange={setView}
          />

          {/* RESULTS */}
          {error ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-700">
              {error}
            </p>
          ) : loading && results.length === 0 ? (
            <ServiceGridSkeleton />
          ) : results.length === 0 ? (
            <EmptyState hasActiveFilter={hasActiveFilter} onReset={resetFilters} />
          ) : (
            <ul
              className={
                view === "list"
                  ? "grid gap-6 grid-cols-1"
                  : "grid gap-6 sm:grid-cols-2 xl:grid-cols-3"
              }
            >
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
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Sidebar — single card stacking labeled filter sections.
 * Live-applies on change; small "Reset" link in the header for everything-clear.
 * ------------------------------------------------------------------------- */

function FiltersSidebar({
  q,
  onQChange,
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
}: {
  q: string;
  onQChange: (v: string) => void;
  bookingDate: string;
  onBookingDateChange: (v: string) => void;
  guests: number;
  onGuestsChange: (n: number) => void;
  city: string;
  onCityChange: (v: string) => void;
  cities: string[];
  categories: Category[];
  selectedCategories: number[];
  onToggleCategory: (id: number) => void;
  minRating: string;
  onMinRatingChange: (v: string) => void;
  canReset: boolean;
  onReset: () => void;
}) {
  const minDate = todayIso();
  return (
    <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Filters</h2>
        {canReset && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            <RotateCcw size={12} />
            Reset
          </button>
        )}
      </div>

      <div className="space-y-5">
        <Section icon={<Store size={16} className="text-brand-600" />} label="Service name">
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={q}
              onChange={(e) => onQChange(e.target.value)}
              placeholder="Search service name"
              aria-label="Search services"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-8 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            {q && (
              <button
                type="button"
                onClick={() => onQChange("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </Section>

        <Section icon={<Calendar size={16} className="text-brand-600" />} label="When">
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
        </Section>

        <Section icon={<Users size={16} className="text-brand-600" />} label="Guests">
          <select
            value={guests}
            onChange={(e) => onGuestsChange(Number(e.target.value))}
            aria-label="Number of guests"
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n === 1 ? "1 guest" : `${n} guests`}
              </option>
            ))}
          </select>
        </Section>

        <Section icon={<MapPin size={16} className="text-brand-600" />} label="City">
          <select
            value={city}
            onChange={(e) => onCityChange(e.target.value)}
            aria-label="Filter by city"
            className={`h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 ${
              city ? "text-slate-900" : "text-slate-400"
            }`}
          >
            <option value="">All cities</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Section>

        <Section icon={<Tag size={16} className="text-brand-600" />} label="Category">
          {categories.length === 0 ? (
            <p className="text-xs text-slate-400">No categories available.</p>
          ) : (
            <ul className="space-y-1.5">
              {categories.map((c) => {
                const checked = selectedCategories.includes(c.id);
                return (
                  <li key={c.id}>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={checked}
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
        </Section>

        <Section icon={<Star size={16} className="text-brand-600" />} label="Rating">
          <ul className="space-y-1.5">
            {RATING_OPTIONS.map((o) => {
              const checked = minRating === o.value;
              return (
                <li key={o.value}>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={checked}
                      // Single-select-as-checkbox: tapping the active row clears
                      // the filter; tapping a different row replaces it. Matches
                      // the screenshot's "4★ & up / 4.5★ & up" pattern where
                      // both rows describe a single threshold.
                      onChange={() => onMinRatingChange(checked ? "" : o.value)}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span className="inline-flex items-center gap-1">
                      <Star size={12} className="fill-amber-400 text-amber-400" />
                      {o.label}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </Section>
      </div>
    </aside>
  );
}

function Section({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-900">
        {icon}
        {label}
      </div>
      {children}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Top bar — count, sort dropdown, grid/list view toggle.
 * ------------------------------------------------------------------------- */

function ResultsTopBar({
  totalCount,
  loading,
  sort,
  onSortChange,
  view,
  onViewChange,
}: {
  totalCount: number;
  loading: boolean;
  sort: string;
  onSortChange: (v: string) => void;
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
      <p className="text-sm text-slate-600">
        {loading ? (
          <span className="text-slate-400">Loading…</span>
        ) : (
          <>
            <span className="font-semibold text-slate-900">{totalCount}</span>{" "}
            service{totalCount === 1 ? "" : "s"} found
          </>
        )}
      </p>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <span>Sort by</span>
          <select
            value={sort}
            onChange={(e) => onSortChange(e.target.value)}
            aria-label="Sort services"
            className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-medium text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value || "recommended"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <div
          role="group"
          aria-label="Toggle view"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1"
        >
          <ToggleButton
            active={view === "grid"}
            onClick={() => onViewChange("grid")}
            label="Grid view"
          >
            <LayoutGrid size={16} />
          </ToggleButton>
          <ToggleButton
            active={view === "list"}
            onClick={() => onViewChange("list")}
            label="List view"
          >
            <List size={16} />
          </ToggleButton>
        </div>
      </div>
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
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md ${
        active ? "bg-brand-600 text-white" : "text-slate-500 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

/* ----------------------------------------------------------------------------
 * Header decoration & states
 * ------------------------------------------------------------------------- */

function HeaderDecoration() {
  return (
    <div
      aria-hidden
      className="relative hidden h-16 w-24 flex-shrink-0 sm:block"
    >
      <div className="absolute right-2 top-0 h-12 w-12 rounded-full bg-brand-100" />
      <div className="absolute right-0 top-3 h-10 w-10 rounded-full bg-brand-200/70" />
      <Search
        size={20}
        className="absolute right-3 top-5 text-brand-700"
        strokeWidth={2.5}
      />
      <span className="absolute right-12 top-1 h-1.5 w-1.5 rounded-full bg-brand-300" />
      <span className="absolute right-14 top-8 h-1 w-1 rounded-full bg-brand-400" />
    </div>
  );
}

function ServiceGridSkeleton() {
  return (
    <ul className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
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

function EmptyState({
  hasActiveFilter,
  onReset,
}: {
  hasActiveFilter: boolean;
  onReset: () => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
      <p className="text-sm font-medium text-slate-700">
        {hasActiveFilter ? "No services match your filters." : "No services yet."}
      </p>
      {hasActiveFilter && (
        <button
          type="button"
          onClick={onReset}
          className="mt-2 text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          Reset filters
        </button>
      )}
    </div>
  );
}

export default function ServiceSearchPage() {
  return (
    <Suspense fallback={<p className="py-6 text-sm text-slate-500">Loading services…</p>}>
      <ServiceSearchInner />
    </Suspense>
  );
}
