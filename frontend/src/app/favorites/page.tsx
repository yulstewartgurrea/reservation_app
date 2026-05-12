"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type FavoriteEntry = { id: number; shop: number; created_at: string };
type Shop = { id: number; name: string; city: string };

export default function FavoritesPage() {
  const [favorites, setFavorites] = useState<FavoriteEntry[]>([]);
  const [shops, setShops] = useState<Record<number, Shop>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get("/shops/favorites/");
      const list: FavoriteEntry[] = data.results ?? data;
      setFavorites(list);
      const lookups = await Promise.all(
        list.map((f) => api.get(`/shops/${f.shop}/`).then((r) => r.data as Shop))
      );
      const map: Record<number, Shop> = {};
      for (const s of lookups) map[s.id] = s;
      setShops(map);
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: number) {
    await api.delete(`/shops/favorites/${id}/`);
    load();
  }

  return (
    <div className="space-y-4 py-4">
      <h1 className="text-2xl font-semibold">Favorites</h1>
      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : favorites.length === 0 ? (
        <p className="text-sm text-slate-500">
          No favorites yet. Tap the ♡ on a shop page to save it here.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {favorites.map((f) => {
            const s = shops[f.shop];
            return (
              <li
                key={f.id}
                className="flex items-start justify-between rounded-lg border border-slate-200 bg-white p-4"
              >
                <Link href={`/shops/${f.shop}`} className="flex-1">
                  <div className="font-semibold">{s?.name ?? "…"}</div>
                  <div className="text-sm text-slate-600">{s?.city}</div>
                </Link>
                <button
                  onClick={() => remove(f.id)}
                  aria-label="Remove favorite"
                  className="text-red-500 hover:text-red-700"
                >
                  ♥
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
