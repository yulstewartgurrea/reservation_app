"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MapPin, Search } from "lucide-react";
import { api } from "@/lib/api";
import { ShopCard, ShopCardData } from "@/components/ShopCard";

function ShopsPageInner() {
  const params = useSearchParams();
  const [shops, setShops] = useState<ShopCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationStatus, setLocationStatus] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (params.get("nearby") === "1") {
      requestNearby();
    } else {
      loadAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const { data } = await api.get("/shops/", { params: { search: query || undefined } });
      setShops(data.results ?? data);
    } finally {
      setLoading(false);
    }
  }

  function requestNearby() {
    if (!("geolocation" in navigator)) {
      setLocationStatus("Geolocation not supported. Showing all shops.");
      loadAll();
      return;
    }
    setLocationStatus("Requesting your location…");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLocationStatus(null);
        setLoading(true);
        try {
          const { data } = await api.get("/shops/nearby/", {
            params: {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              radius_km: 10,
            },
          });
          setShops(data);
        } finally {
          setLoading(false);
        }
      },
      () => {
        setLocationStatus("Location denied. Showing all shops — try entering a city below.");
        loadAll();
      },
      { timeout: 10_000 }
    );
  }

  return (
    <div className="space-y-6 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Browse shops</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Discover local shops near you and book in seconds.
          </p>
        </div>
        <button
          onClick={requestNearby}
          className="inline-flex items-center gap-1.5 self-start rounded-md border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50"
        >
          <MapPin size={16} className="text-slate-500" />
          Find shops near me
        </button>
      </div>

      <div className="relative">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && loadAll()}
          placeholder="Search by name or city"
          className="w-full rounded-full border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

      {locationStatus && <p className="text-sm text-slate-600">{locationStatus}</p>}

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : shops.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No shops found.
        </p>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shops.map((shop) => (
            <ShopCard
              key={shop.id}
              shop={shop}
              href={`/shops/${shop.id}`}
              cta="View"
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ShopsPage() {
  return (
    <Suspense fallback={<p className="py-6 text-sm text-slate-500">Loading shops…</p>}>
      <ShopsPageInner />
    </Suspense>
  );
}
