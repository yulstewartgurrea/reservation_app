"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/errors";
import { Pagination } from "@/components/Pagination";
import { ShopCard, ShopCardData } from "@/components/ShopCard";

const PAGE_SIZE = 12;

type Paginated<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

function MyShopsPageInner() {
  const router = useRouter();
  const params = useSearchParams();

  const [shops, setShops] = useState<ShopCardData[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(() => {
    const raw = Number(params.get("page"));
    return Number.isFinite(raw) && raw > 0 ? raw : 1;
  });

  const fetchPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<Paginated<ShopCardData>>("/shops/mine/", {
        params: { page, page_size: PAGE_SIZE },
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
  }, [page]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  useEffect(() => {
    const sp = new URLSearchParams();
    if (page > 1) sp.set("page", String(page));
    const qs = sp.toString();
    router.replace(qs ? `/my-shops?${qs}` : "/my-shops", { scroll: false });
  }, [page, router]);

  const showPagination = totalCount > PAGE_SIZE;

  return (
    <div className="space-y-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">My shops</h1>
          {!loading && totalCount > 0 && (
            <p className="mt-0.5 text-sm text-slate-500">
              {totalCount} shop{totalCount === 1 ? "" : "s"}
            </p>
          )}
        </div>
        <Link
          href="/my-shops/new"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          + New shop
        </Link>
      </div>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </p>
      )}

      {loading && shops.length === 0 ? (
        <ShopGridSkeleton />
      ) : shops.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-slate-700">No shops yet.</p>
          <p className="mt-1 text-sm text-slate-500">
            Create your first shop to start accepting reservations.
          </p>
          <Link
            href="/my-shops/new"
            className="mt-4 inline-block rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Create a shop
          </Link>
        </div>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shops.map((shop) => (
            <ShopCard
              key={shop.id}
              shop={shop}
              href={`/my-shops/${shop.id}`}
              cta="Manage"
              showStatus
            />
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
    </div>
  );
}

function ShopGridSkeleton() {
  return (
    <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
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

export default function DashboardPage() {
  return (
    <Suspense fallback={<p className="py-6 text-sm text-slate-500">Loading shops…</p>}>
      <MyShopsPageInner />
    </Suspense>
  );
}
