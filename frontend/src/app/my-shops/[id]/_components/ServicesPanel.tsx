"use client";

/**
 * Services panel — header + KPI strip + filter bar + paginated grid.
 *
 * Self-contained: owns its own toast + delete-confirmation dialog. Used as
 * the leaf of `/my-shops/[id]/services/page.tsx` (and as the landing view
 * of `/my-shops/[id]/page.tsx`).
 *
 * Data flow:
 * - Search/sort/status/page state lives here.
 * - The search input is debounced (350ms) so the user can type freely.
 * - Any filter/sort/search change resets to page 1 to avoid landing on an
 *   empty page after a filter narrows the result set.
 * - Stats are fetched separately from the paginated list so totals stay
 *   correct regardless of which page is shown.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/errors";
import { ServiceCard, ServiceCardData } from "@/components/ServiceCard";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { Toast, ToastMessage } from "@/components/Toast";
import { ServiceFilterBar, SortKey, StatusFilter } from "./ServiceFilterBar";
import { ServiceStats, ServiceStatsData } from "./ServiceStats";
import { Pagination } from "@/components/Pagination";

const PAGE_SIZE = 20; // must match backend REST_FRAMEWORK.PAGE_SIZE
const SEARCH_DEBOUNCE_MS = 350;

type ServiceRow = ServiceCardData & { description?: string };

type Paginated<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

/** Map a frontend sort key to DRF's `ordering` param. */
const ORDERING: Record<SortKey, string> = {
  "name-asc": "name",
  "name-desc": "-name",
  "price-asc": "price",
  "price-desc": "-price",
};

export function ServicesPanel({ shopId }: { shopId: string }) {
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [stats, setStats] = useState<ServiceStatsData | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // User-controlled filters
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("name-asc");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, status, sort]);

  const listParams = useMemo(() => {
    const params: Record<string, string | number> = { shop: shopId, page };
    if (debouncedQuery.trim()) params.search = debouncedQuery.trim();
    if (status === "active") params.is_active = "true";
    if (status === "inactive") params.is_active = "false";
    params.ordering = ORDERING[sort];
    return params;
  }, [shopId, page, debouncedQuery, status, sort]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Paginated<ServiceRow>>("/services/", {
        params: listParams,
      });
      setServices(res.data.results);
      setTotalCount(res.data.count);
    } catch (err) {
      setToast({
        variant: "error",
        message: formatApiError(err, "Failed to load services."),
      });
    } finally {
      setLoading(false);
    }
  }, [listParams]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get<ServiceStatsData>("/services/stats/", {
        params: { shop: shopId },
      });
      setStats(res.data);
    } catch (err) {
      // Stats failure shouldn't block the grid — log only.
      console.warn("Failed to load service stats:", formatApiError(err));
    }
  }, [shopId]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  async function confirmDelete() {
    if (deletingId == null) return;
    try {
      await api.delete(`/services/${deletingId}/`);
      setToast({ variant: "success", message: "Service deleted." });
      setDeletingId(null);
      fetchList();
      fetchStats();
    } catch (err) {
      setToast({ variant: "error", message: formatApiError(err) });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Services</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage the services you offer to your customers.
          </p>
        </div>
        <Link
          href={`/my-shops/${shopId}/services/new`}
          className="inline-flex items-center gap-1.5 self-start rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
        >
          <span className="text-base leading-none">+</span>
          New service
        </Link>
      </div>

      <ServiceStats stats={stats} />

      <ServiceFilterBar
        query={query}
        status={status}
        sort={sort}
        onQueryChange={setQuery}
        onStatusChange={setStatus}
        onSortChange={setSort}
      />

      {loading && services.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          Loading services…
        </p>
      ) : services.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          {totalCount === 0 && !debouncedQuery && status === "all"
            ? "No services yet. Add one to start accepting bookings."
            : "No services match your filters."}
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {services.map((s) => (
            <ServiceCard
              key={s.id}
              service={s}
              editHref={`/my-shops/${shopId}/services/${s.id}/edit`}
              onDelete={() => setDeletingId(s.id)}
            />
          ))}
        </ul>
      )}

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={totalCount}
        onPageChange={setPage}
        unitLabel="services"
      />

      {deletingId != null && (
        <ConfirmationDialog
          open
          title="Delete this service?"
          description="Past reservations using this service stay intact, but customers won't be able to book it anymore."
          variant="danger"
          confirmLabel="Delete service"
          onConfirm={confirmDelete}
          onCancel={() => setDeletingId(null)}
        />
      )}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
