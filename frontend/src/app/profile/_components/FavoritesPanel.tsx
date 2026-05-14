"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Heart, Search } from "lucide-react";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/errors";
import { PageHeader } from "@/components/PageHeader";
import { ShopCard, ShopCardData } from "@/components/ShopCard";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { Toast, ToastMessage } from "@/components/Toast";

type FavoriteEntry = {
  id: number;
  shop: number;
  shop_detail: ShopCardData;
  created_at: string;
};

type Props = {
  /** When provided, a Back button is rendered in the header. */
  onBack?: () => void;
};

export function FavoritesPanel({ onBack }: Props) {
  const [favorites, setFavorites] = useState<FavoriteEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<FavoriteEntry | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get("/shops/favorites/");
      const list: FavoriteEntry[] = data.results ?? data;
      setFavorites(list);
    } catch (err) {
      setError(formatApiError(err, "Failed to load favorites."));
      setFavorites([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function confirmRemove() {
    if (!removing) return;
    const target = removing;
    setRemoving(null);
    try {
      await api.delete(`/shops/favorites/${target.id}/`);
      setFavorites((prev) => prev.filter((f) => f.id !== target.id));
      setToast({
        variant: "success",
        message: `Removed ${target.shop_detail?.name ?? "shop"} from favorites.`,
      });
    } catch (err) {
      setToast({
        variant: "error",
        message: formatApiError(err, "Failed to remove favorite."),
      });
    }
  }

  return (
    <div className="space-y-6 py-4">
      <PageHeader
        onBack={onBack}
        backLabel={onBack ? "Back" : undefined}
        icon={Heart}
        title="Favorites"
        description={
          loading
            ? undefined
            : favorites.length === 0
              ? "Shops you've saved will appear here."
              : `${favorites.length} saved shop${favorites.length === 1 ? "" : "s"}.`
        }
      />

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </p>
      )}

      {loading && favorites.length === 0 ? (
        <ShopGridSkeleton />
      ) : favorites.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {favorites.map((fav) => (
            <FavoriteCard key={fav.id} entry={fav} onRemove={() => setRemoving(fav)} />
          ))}
        </ul>
      )}

      <ConfirmationDialog
        open={!!removing}
        title="Remove from favorites?"
        description={`${removing?.shop_detail?.name ?? "This shop"} will no longer appear in your favorites. You can re-add it any time from the shop page.`}
        confirmLabel="Remove"
        variant="danger"
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(null)}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

function FavoriteCard({
  entry,
  onRemove,
}: {
  entry: FavoriteEntry;
  onRemove: () => void;
}) {
  return (
    <li className="relative">
      <ShopCard shop={entry.shop_detail} href={`/shops/${entry.shop}`} cta="View" />
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${entry.shop_detail?.name ?? "shop"} from favorites`}
        className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-rose-500 shadow ring-1 ring-slate-200 transition hover:bg-rose-50 hover:text-rose-600"
      >
        <Heart size={18} fill="currentColor" />
      </button>
    </li>
  );
}

function ShopGridSkeleton() {
  return (
    <ul className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} className="overflow-hidden rounded-lg bg-white shadow-sm" aria-hidden="true">
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

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
      <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-500">
        <Heart size={22} />
      </div>
      <p className="text-sm font-medium text-slate-800">No favorites yet</p>
      <p className="mt-1 text-sm text-slate-500">
        Tap the heart on any shop to save it here for quick rebooking.
      </p>
      <Link
        href="/shops"
        className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
      >
        <Search size={14} />
        Browse shops
      </Link>
    </div>
  );
}
