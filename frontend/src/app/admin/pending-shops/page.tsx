"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Shop = {
  id: number;
  name: string;
  city: string;
  country: string;
  owner: number;
  description: string;
  created_at: string;
};

export default function PendingShopsPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get("/admin-panel/pending-shops/");
      setShops(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function approve(id: number) {
    await api.post(`/admin-panel/shops/${id}/approve/`);
    load();
  }

  return (
    <div className="space-y-4 py-4">
      <h1 className="text-2xl font-semibold">Pending shops</h1>
      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : shops.length === 0 ? (
        <p className="text-sm text-slate-500">Nothing pending.</p>
      ) : (
        <ul className="space-y-3">
          {shops.map((s) => (
            <li key={s.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{s.name}</div>
                  <div className="text-sm text-slate-600">
                    {s.city}
                    {s.country ? `, ${s.country}` : ""} · created{" "}
                    {new Date(s.created_at).toLocaleDateString()}
                  </div>
                  {s.description && (
                    <p className="mt-1 text-sm text-slate-700">{s.description}</p>
                  )}
                </div>
                <button
                  onClick={() => approve(s.id)}
                  className="rounded-md bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700"
                >
                  Approve
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
