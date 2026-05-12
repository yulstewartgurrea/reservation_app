"use client";

import { ChangeEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/errors";

type Photo = { id: number; image: string; caption: string; sort_order: number };

export default function ShopPhotosPage() {
  const { id } = useParams<{ id: string }>();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data } = await api.get(`/shops/${id}/photos/`);
    setPhotos(data);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("image", file);
      await api.post(`/shops/${id}/photos/`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      load();
    } catch (err) {
      setError(formatApiError(err, "Upload failed."));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function remove(photoId: number) {
    if (!confirm("Delete this photo?")) return;
    await api.delete(`/shops/${id}/photos/${photoId}/`);
    load();
  }

  return (
    <div className="mx-auto max-w-2xl py-6">
      <div className="mb-4">
        <Link
          href={`/dashboard/shops/${id}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft size={16} />
          Back
        </Link>
      </div>
      <h1 className="text-2xl font-semibold">Shop photos</h1>
      <p className="mt-1 text-sm text-slate-600">
        Customers see these on your shop page. PNG/JPG under 5 MB recommended.
      </p>

      <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700">
        <input type="file" accept="image/*" onChange={upload} className="sr-only" />
        {uploading ? "Uploading…" : "+ Upload photo"}
      </label>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((p) => (
          <li key={p.id} className="relative overflow-hidden rounded-lg border border-slate-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.image} alt={p.caption} className="aspect-square w-full object-cover" />
            <button
              onClick={() => remove(p.id)}
              className="absolute right-1 top-1 rounded bg-red-600/80 px-2 py-1 text-xs text-white"
            >
              Delete
            </button>
          </li>
        ))}
        {photos.length === 0 && (
          <li className="col-span-full text-sm text-slate-500">No photos yet.</li>
        )}
      </ul>
    </div>
  );
}
