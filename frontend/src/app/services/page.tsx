"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { api } from "@/lib/api";
import { PublicServiceCard, PublicServiceHit } from "@/components/PublicServiceCard";

type Category = { id: number; name: string };

export default function ServiceSearchPage() {
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [category, setCategory] = useState<string>("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [results, setResults] = useState<PublicServiceHit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api
      .get("/services/categories/")
      .then((r) => setCategories(r.data.results ?? r.data))
      .catch(() => undefined);
    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function search() {
    setLoading(true);
    try {
      const { data } = await api.get("/services/discover/", {
        params: {
          q: q || undefined,
          city: city || undefined,
          category: category || undefined,
        },
      });
      setResults(data);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 py-4">
      <div>
        <h1 className="text-2xl font-semibold">Find a service</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Browse services across all active shops.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Service name (haircut, massage, …)"
            className="w-full rounded-full border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="City"
          className="rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          onClick={search}
          className="rounded-full bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          Search
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Searching…</p>
      ) : results.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No matches.
        </p>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {results.map((s) => (
            <PublicServiceCard key={s.id} service={s} />
          ))}
        </ul>
      )}
    </div>
  );
}
