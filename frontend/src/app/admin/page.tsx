"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Overview = {
  shops: { total: number; active: number; pending: number; paused: number };
  reservations: { total: number; completed: number; no_show: number };
  commission: { total: number; settled: number; outstanding: number };
};

export default function AdminHomePage() {
  const { user } = useAuth();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get("/admin-panel/overview/")
      .then((r) => setData(r.data))
      .catch((err) => setError(err?.response?.data?.detail ?? "Forbidden"));
  }, []);

  if (user && user.role !== "admin") {
    return (
      <div className="py-10 text-center text-sm text-slate-500">
        Admin access required.
      </div>
    );
  }

  if (error) return <p className="py-6 text-sm text-red-600">{error}</p>;
  if (!data) return <p className="py-6 text-sm text-slate-500">Loading…</p>;

  const tile = (label: string, value: number | string) => (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );

  return (
    <div className="space-y-6 py-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Admin overview</h1>
        <div className="flex gap-2">
          <Link
            href="/admin/pending-shops"
            className="rounded-md bg-brand-600 px-3 py-2 text-sm text-white hover:bg-brand-700"
          >
            Review shops ({data.shops.pending})
          </Link>
          <Link
            href="/admin/commission"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          >
            Commission ledger
          </Link>
          <Link
            href="/admin/tickets"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          >
            Support tickets
          </Link>
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Shops</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tile("Total", data.shops.total)}
          {tile("Active", data.shops.active)}
          {tile("Pending", data.shops.pending)}
          {tile("Paused", data.shops.paused)}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Reservations
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {tile("Total", data.reservations.total)}
          {tile("Completed", data.reservations.completed)}
          {tile("No-show", data.reservations.no_show)}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Commission ($)
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {tile("Total", data.commission.total.toFixed(2))}
          {tile("Settled", data.commission.settled.toFixed(2))}
          {tile("Outstanding", data.commission.outstanding.toFixed(2))}
        </div>
      </section>
    </div>
  );
}
