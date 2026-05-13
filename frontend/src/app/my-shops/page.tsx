"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/errors";
import { ShopCard, ShopCardData } from "@/components/ShopCard";

export default function DashboardPage() {
  const [shops, setShops] = useState<ShopCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get("/shops/mine/")
      .then((r) => setShops(r.data))
      .catch((err) => setError(formatApiError(err, "Failed to load shops.")))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6 py-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My shops</h1>
        <Link
          href="/dashboard/shops/new"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          + New shop
        </Link>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : shops.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-slate-700">No shops yet.</p>
          <p className="mt-1 text-sm text-slate-500">
            Create your first shop to start accepting reservations.
          </p>
          <Link
            href="/dashboard/shops/new"
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
              href={`/dashboard/shops/${shop.id}`}
              cta="Manage"
              showStatus
            />
          ))}
        </ul>
      )}
    </div>
  );
}
