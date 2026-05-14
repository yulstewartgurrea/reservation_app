"use client";

/**
 * Shop photos page.
 *
 * Backend returns photos ordered by `sort_order, id`. The first photo (lowest
 * sort_order) is treated as the cover — it's what surfaces on the public shop
 * card and shop detail. Owners can:
 *   - upload a new photo (appended to the back of the queue)
 *   - delete a photo
 *   - promote any photo to cover via `POST /shops/<id>/photos/<photo_id>/cover/`
 *
 * The "first photo = cover" convention is consistent across the codebase
 * (`ShopListSerializer.get_cover_photo`); changing it would require updating
 * the serializer too.
 */

import { ChangeEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Image as ImageIcon, ImagePlus, Star, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/errors";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { Toast, ToastMessage } from "@/components/Toast";

type Photo = {
  id: number;
  image: string;
  caption: string;
  sort_order: number;
};

export default function ShopPhotosPage() {
  const { id } = useParams<{ id: string }>();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function load() {
    try {
      const { data } = await api.get(`/shops/${id}/photos/`);
      setPhotos(data);
    } catch (err) {
      setToast({
        variant: "error",
        message: formatApiError(err, "Failed to load photos."),
      });
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("image", file);
      await api.post(`/shops/${id}/photos/`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setToast({ variant: "success", message: "Photo uploaded." });
      await load();
    } catch (err) {
      setToast({ variant: "error", message: formatApiError(err, "Upload failed.") });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function confirmDelete() {
    if (deletingId == null) return;
    try {
      await api.delete(`/shops/${id}/photos/${deletingId}/`);
      setToast({ variant: "success", message: "Photo deleted." });
      setDeletingId(null);
      await load();
    } catch (err) {
      setToast({ variant: "error", message: formatApiError(err) });
    }
  }

  async function setCover(photoId: number) {
    try {
      const { data } = await api.post(`/shops/${id}/photos/${photoId}/cover/`);
      setPhotos(data);
      setToast({ variant: "success", message: "Cover photo updated." });
    } catch (err) {
      setToast({
        variant: "error",
        message: formatApiError(err, "Failed to set cover."),
      });
    }
  }

  // First photo in the sort order is the cover. The backend guarantees the
  // list comes back already sorted.
  const coverId = photos[0]?.id;

  return (
    <div className="mx-auto max-w-4xl py-6">
      <PageHeader
        icon={ImageIcon}
        title="Shop photos"
        description="Customers see these on your shop page. The first photo is your cover — promote any other photo to make it the new cover."
      />

      {/* Upload dropzone */}
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-white py-8 text-sm text-slate-600 hover:bg-slate-50">
        <input type="file" accept="image/*" onChange={upload} className="sr-only" />
        <ImagePlus size={28} className="text-slate-400" />
        <span className="font-medium text-slate-700">
          {uploading ? "Uploading…" : "Upload photo"}
        </span>
        <span className="text-xs text-slate-500">PNG or JPG, under 5 MB</span>
      </label>

      {photos.length === 0 ? (
        <p className="mt-6 rounded-md border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          No photos yet. Upload one to give customers a preview of your shop.
        </p>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((p) => (
            <PhotoCard
              key={p.id}
              photo={p}
              isCover={p.id === coverId}
              onSetCover={() => setCover(p.id)}
              onDelete={() => setDeletingId(p.id)}
            />
          ))}
        </ul>
      )}

      {deletingId != null && (
        <ConfirmationDialog
          open
          title="Delete this photo?"
          description="The photo will be removed from your shop page. This can't be undone."
          variant="danger"
          confirmLabel="Delete photo"
          onConfirm={confirmDelete}
          onCancel={() => setDeletingId(null)}
        />
      )}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

function PhotoCard({
  photo,
  isCover,
  onSetCover,
  onDelete,
}: {
  photo: Photo;
  isCover: boolean;
  onSetCover: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="relative aspect-[4/3] w-full bg-slate-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.image}
          alt={photo.caption || "Shop photo"}
          className="h-full w-full object-cover"
        />
        {isCover && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-brand-600 px-2.5 py-1 text-xs font-medium text-white shadow-sm">
            <Star size={12} fill="currentColor" />
            Cover
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 px-3 py-3">
        {isCover ? (
          <span className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-500">
            <Star size={14} className="text-brand-600" fill="currentColor" />
            Current cover
          </span>
        ) : (
          <button
            type="button"
            onClick={onSetCover}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Star size={14} />
            Set as cover
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete photo"
          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </li>
  );
}
