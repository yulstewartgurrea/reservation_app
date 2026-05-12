"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Row = {
  id: number;
  shop_id: number;
  shop_name: string;
  amount: number;
  rate: number;
  period: string;
  settled: boolean;
  created_at: string;
};

type Summary = {
  shop_id: number;
  shop_name: string;
  total: number;
  settled: number;
  outstanding: number;
};

export default function CommissionPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary[]>([]);
  const [period, setPeriod] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get("/admin-panel/commission/", {
        params: period ? { period } : undefined,
      });
      setRows(data.rows);
      setSummary(data.by_shop);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  return (
    <div className="space-y-6 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Commission ledger</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600">Period</label>
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
          {period && (
            <button
              onClick={() => setPeriod("")}
              className="text-xs text-slate-500 hover:underline"
            >
              clear
            </button>
          )}
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          By shop
        </h2>
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : summary.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Shop</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-right">Settled</th>
                  <th className="px-3 py-2 text-right">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((r) => (
                  <tr key={r.shop_id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{r.shop_name}</td>
                    <td className="px-3 py-2 text-right">${r.total.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-emerald-700">
                      ${r.settled.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right text-amber-700">
                      ${r.outstanding.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Recent entries
        </h2>
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between rounded-md border border-slate-200 bg-white p-3 text-sm"
            >
              <div>
                <div className="font-medium">{r.shop_name}</div>
                <div className="text-xs text-slate-500">
                  {r.period} · rate {(r.rate * 100).toFixed(1)}% ·{" "}
                  {new Date(r.created_at).toLocaleDateString()}
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold">${r.amount.toFixed(2)}</div>
                <div className={`text-xs ${r.settled ? "text-emerald-700" : "text-amber-700"}`}>
                  {r.settled ? "settled" : "outstanding"}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
