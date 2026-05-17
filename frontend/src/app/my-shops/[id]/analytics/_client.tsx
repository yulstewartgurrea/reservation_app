"use client";

import { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { useUrlParams } from "@/lib/useUrlParams";

type Analytics = {
  window_days: number;
  totals: {
    reservations: number;
    completed: number;
    no_shows: number;
    no_show_rate: number;
    revenue: number;
    commission: number;
    net_after_commission: number;
  };
  top_services: { name: string; count: number }[];
};

export default function ShopAnalyticsPage() {
  const { id } = useUrlParams<{ id: string }>("/my-shops/[id]/analytics");
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!id) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/shops/${id}/analytics/`, { params: { days } });
      setData(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, days]);

  const tile = (label: string, value: string | number, accent?: string) => (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${accent ?? ""}`}>{value}</div>
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-6">
      <PageHeader
        icon={BarChart3}
        title="Shop analytics"
        description="Booking volume, completion, and revenue for the selected window."
        actions={
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">Window</label>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={365}>Last year</option>
            </select>
          </div>
        }
      />

      {loading || !data ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {tile("Total bookings", data.totals.reservations)}
            {tile("Completed", data.totals.completed, "text-emerald-700")}
            {tile("No-shows", data.totals.no_shows, "text-amber-700")}
            {tile("No-show rate", `${(data.totals.no_show_rate * 100).toFixed(1)}%`)}
          </section>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {tile("Revenue", `$${data.totals.revenue.toFixed(2)}`)}
            {tile("Commission", `$${data.totals.commission.toFixed(2)}`, "text-amber-700")}
            {tile(
              "Net after commission",
              `$${data.totals.net_after_commission.toFixed(2)}`,
              "text-emerald-700"
            )}
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Top services
            </h2>
            {data.top_services.length === 0 ? (
              <p className="text-sm text-slate-500">No completed bookings yet.</p>
            ) : (
              <ol className="space-y-1">
                {data.top_services.map((s, i) => (
                  <li
                    key={s.name + i}
                    className="flex items-center justify-between rounded-md border border-slate-200 bg-white p-3 text-sm"
                  >
                    <span>{s.name || "—"}</span>
                    <span className="font-semibold">{s.count}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </div>
  );
}
