"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUrlParams } from "@/lib/useUrlParams";
import {
  Building,
  Building2,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  ImagePlus,
  MapPin,
  MoreHorizontal,
  Pencil,
  Phone,
  Sliders,
  Star,
  Store,
  Trash2,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/errors";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { FormField as Field, FormSection as Section } from "@/components/FormSection";
import { geocodeAddress } from "@/components/LocationMap";
import { LocationPicker, type PinResult } from "@/components/LocationPicker";
import { PageHeader } from "@/components/PageHeader";
import { Toast, ToastMessage } from "@/components/Toast";

type FormValues = {
  name: string;
  description: string;
  address_line: string;
  address_line_2: string;
  city: string;
  state_province: string;
  barangay: string;
  postal_code: string;
  country: string;
  landmark: string;
  phone: string;
  email: string;
  latitude: string;
  longitude: string;
  cancellation_window_hours: string;
};

type Shop = FormValues & {
  id: number;
  status: "active" | "paused" | "pending";
  photos: { id: number; image: string; caption: string }[];
};

type StagedPhoto = { id: string; file: File; preview: string };

const DESCRIPTION_MAX = 500;
const MAX_PHOTOS = 8;

const COUNTRIES = [
  "Philippines",
  "United States",
  "United Kingdom",
  "Singapore",
  "Japan",
  "Australia",
  "Canada",
  "Hong Kong",
  "Malaysia",
  "Indonesia",
  "Thailand",
  "Vietnam",
];

function toFormValues(d: Partial<Shop>): FormValues {
  return {
    name: d.name ?? "",
    description: d.description ?? "",
    address_line: d.address_line ?? "",
    address_line_2: d.address_line_2 ?? "",
    city: d.city ?? "",
    state_province: d.state_province ?? "",
    barangay: d.barangay ?? "",
    postal_code: d.postal_code ?? "",
    country: d.country ?? "",
    landmark: d.landmark ?? "",
    phone: d.phone ?? "",
    email: d.email ?? "",
    latitude: d.latitude?.toString() ?? "",
    longitude: d.longitude?.toString() ?? "",
    cancellation_window_hours:
      d.cancellation_window_hours?.toString() ?? "",
  };
}

export default function EditShopPage() {
  const { id } = useUrlParams<{ id: string }>("/my-shops/[id]/edit");
  const router = useRouter();

  const [shop, setShop] = useState<Shop | null>(null);
  const [form, setForm] = useState<FormValues | null>(null);
  const [original, setOriginal] = useState<FormValues | null>(null);
  const [staged, setStaged] = useState<StagedPhoto[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [deletingPhotoId, setDeletingPhotoId] = useState<number | null>(null);
  const [coverPromotionId, setCoverPromotionId] = useState<number | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);

  async function loadShop() {
    if (!id) return;
    try {
      const { data } = await api.get(`/shops/${id}/`);
      setShop(data);
      const v = toFormValues(data);
      setForm(v);
      setOriginal(v);
    } catch (err) {
      setToast({ variant: "error", message: formatApiError(err, "Failed to load.") });
    }
  }

  useEffect(() => {
    if (!id) return;
    loadShop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Revoke staged preview URLs on unmount.
  useEffect(() => {
    return () => staged.forEach((p) => URL.revokeObjectURL(p.preview));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dirty = useMemo(() => {
    if (!form || !original) return false;
    return JSON.stringify(form) !== JSON.stringify(original) || staged.length > 0;
  }, [form, original, staged]);

  function update<K extends keyof FormValues>(k: K, v: FormValues[K]) {
    setForm((prev) => (prev ? { ...prev, [k]: v } : prev));
  }

  function stagePhotos(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const existingCount = (shop?.photos.length ?? 0) + staged.length;
    const remaining = MAX_PHOTOS - existingCount;
    const accepted = files.slice(0, remaining).map((file) => ({
      id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      preview: URL.createObjectURL(file),
    }));
    setStaged((prev) => [...prev, ...accepted]);
    e.target.value = "";
  }

  function unstage(stagedId: string) {
    setStaged((prev) => {
      const target = prev.find((p) => p.id === stagedId);
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((p) => p.id !== stagedId);
    });
  }

  async function confirmDeletePhoto() {
    if (!shop || deletingPhotoId == null) return;
    const photoId = deletingPhotoId;
    try {
      await api.delete(`/shops/${id}/photos/${photoId}/`);
      setShop({
        ...shop,
        photos: shop.photos.filter((p) => p.id !== photoId),
      });
      setToast({ variant: "success", message: "Photo removed." });
    } catch (err) {
      setToast({ variant: "error", message: formatApiError(err) });
    } finally {
      setDeletingPhotoId(null);
    }
  }

  async function confirmSetCoverPhoto() {
    if (!shop || coverPromotionId == null) return;
    const photoId = coverPromotionId;
    try {
      const { data } = await api.post(`/shops/${id}/photos/${photoId}/cover/`);
      setShop({ ...shop, photos: data });
      setToast({ variant: "success", message: "Cover photo updated." });
    } catch (err) {
      setToast({
        variant: "error",
        message: formatApiError(err, "Failed to set cover."),
      });
    } finally {
      setCoverPromotionId(null);
    }
  }

  async function uploadStaged() {
    if (staged.length === 0) return;
    setUploading(true);
    try {
      for (const p of staged) {
        const fd = new FormData();
        fd.append("image", p.file);
        await api.post(`/shops/${id}/photos/`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }
    } finally {
      setUploading(false);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (!form.name.trim()) {
      setToast({ variant: "error", message: "Shop name is required." });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null,
        cancellation_window_hours: form.cancellation_window_hours
          ? Number(form.cancellation_window_hours)
          : null,
      };
      await api.patch(`/shops/${id}/`, payload);

      if (staged.length > 0) {
        await uploadStaged();
        staged.forEach((p) => URL.revokeObjectURL(p.preview));
        setStaged([]);
      }

      setToast({ variant: "success", message: "Changes saved." });
      setOriginal(form);
      // Refresh server data so we render the canonical state (e.g. server-side geocoded lat/lng)
      await loadShop();
    } catch (err) {
      setToast({ variant: "error", message: formatApiError(err, "Failed to save.") });
    } finally {
      setSaving(false);
    }
  }

  if (!shop || !form) {
    return <p className="py-10 text-center text-sm text-slate-500">Loading…</p>;
  }

  const canGeocode = Boolean(
    form.address_line.trim() && form.city.trim() && form.country.trim()
  );
  const photoCount = shop.photos.length + staged.length;

  async function geocodeFromAddress() {
    if (!form) return;
    const result = await geocodeAddress({
      address_line: form.address_line,
      city: form.city,
      postal_code: form.postal_code,
      country: form.country,
    });
    if (!result) {
      setToast({
        variant: "error",
        message: "Couldn't find that address on the map. Try refining it.",
      });
      return;
    }
    setForm((prev) =>
      prev
        ? {
            ...prev,
            latitude: result.lat.toFixed(6),
            longitude: result.lng.toFixed(6),
          }
        : prev
    );
  }

  function applyPin(result: PinResult) {
    setForm((prev) => {
      if (!prev) return prev;
      const a = result.address;
      // Only fill empty fields — don't trample what the owner already typed.
      const fillIfEmpty = (cur: string, candidate?: string) =>
        cur.trim() || !candidate ? cur : candidate;
      return {
        ...prev,
        latitude: result.lat.toFixed(6),
        longitude: result.lng.toFixed(6),
        address_line: fillIfEmpty(prev.address_line, a?.address_line),
        city: fillIfEmpty(prev.city, a?.city),
        state_province: fillIfEmpty(prev.state_province, a?.state_province),
        barangay: fillIfEmpty(prev.barangay, a?.barangay),
        postal_code: fillIfEmpty(prev.postal_code, a?.postal_code),
        country: fillIfEmpty(prev.country, a?.country),
      };
    });
    setToast({ variant: "success", message: "Coordinates updated from map pin." });
  }

  const statusPill = (
    <span
      className={`inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-1 text-xs font-medium ${
        shop.status === "active"
          ? "bg-emerald-100 text-emerald-700"
          : shop.status === "paused"
            ? "bg-amber-100 text-amber-700"
            : "bg-slate-100 text-slate-700"
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {shop.status[0].toUpperCase() + shop.status.slice(1)}
    </span>
  );

  return (
    <form onSubmit={save} className="space-y-6 py-6">
      <PageHeader
        icon={Pencil}
        title="Edit shop"
        description={shop.name}
        actions={
          <>
            {statusPill}
            {dirty && (
              <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Unsaved changes
              </span>
            )}
          </>
        }
      />

      <div className="space-y-4">
          {/* 1. BASIC INFO */}
          <Section
            index={1}
            icon={Store}
            title="Basic information"
            subtitle="Name and description of your shop."
          >
            <Field label="Shop name" required>
              <input
                type="text"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </Field>
            <Field label="Description">
              <div className="relative">
                <textarea
                  value={form.description}
                  onChange={(e) =>
                    update("description", e.target.value.slice(0, DESCRIPTION_MAX))
                  }
                  rows={4}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <span className="pointer-events-none absolute bottom-2 right-3 text-xs text-slate-400">
                  {form.description.length} / {DESCRIPTION_MAX}
                </span>
              </div>
            </Field>
          </Section>

          {/* 2. PHOTOS */}
          <Section
            index={2}
            icon={ImageIcon}
            title="Shop photos"
            subtitle="Customers see these on your shop page."
          >
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
              {shop.photos.map((p, idx) => {
                const isCover = idx === 0;
                const menuOpen = menuOpenId === p.id;
                return (
                  <li
                    key={`saved-${p.id}`}
                    className="relative rounded-xl border border-slate-200 bg-slate-100"
                  >
                    <div className="overflow-hidden rounded-xl">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.image}
                        alt={p.caption || shop.name}
                        className="aspect-[4/3] w-full object-cover"
                      />
                    </div>
                    {isCover && (
                      <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-brand-600 px-2 py-0.5 text-xs font-medium text-white shadow">
                        <Star size={12} fill="currentColor" />
                        Cover
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setMenuOpenId(menuOpen ? null : p.id)}
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                      aria-label="Photo actions"
                      className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-slate-600 shadow-sm hover:bg-slate-50"
                    >
                      <MoreHorizontal size={16} />
                    </button>
                    {menuOpen && (
                      <>
                        <button
                          type="button"
                          aria-label="Close menu"
                          tabIndex={-1}
                          onClick={() => setMenuOpenId(null)}
                          className="fixed inset-0 z-10 cursor-default"
                        />
                        <div
                          role="menu"
                          className="absolute right-2 top-11 z-20 w-44 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg"
                        >
                          {!isCover && (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setMenuOpenId(null);
                                setCoverPromotionId(p.id);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                            >
                              <Star size={14} className="text-brand-600" />
                              Set as cover
                            </button>
                          )}
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setMenuOpenId(null);
                              setDeletingPhotoId(p.id);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
                          >
                            <Trash2 size={14} />
                            Delete photo
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                );
              })}
              {staged.map((p) => (
                <li
                  key={`staged-${p.id}`}
                  className="relative rounded-xl border-2 border-dashed border-brand-300 bg-slate-100"
                >
                  <div className="overflow-hidden rounded-xl">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.preview}
                      alt={p.file.name}
                      className="aspect-[4/3] w-full object-cover"
                    />
                  </div>
                  <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-brand-600 px-2 py-0.5 text-xs font-medium text-white shadow">
                    Pending upload
                  </span>
                  <button
                    type="button"
                    onClick={() => unstage(p.id)}
                    className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-red-700"
                    aria-label="Remove pending photo"
                  >
                    <X size={16} />
                  </button>
                </li>
              ))}
            </ul>

            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 py-6 text-sm text-slate-600 hover:bg-slate-50">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={stagePhotos}
                className="sr-only"
                disabled={photoCount >= MAX_PHOTOS}
              />
              <ImagePlus size={24} className="text-slate-400" />
              <span className="font-medium text-slate-700">
                {uploading ? "Uploading…" : "Add photo"}
              </span>
              <span className="text-xs text-slate-500">
                PNG or JPG · up to {MAX_PHOTOS} photos
              </span>
            </label>
            <p className="text-center text-xs text-slate-500">
              {photoCount} of {MAX_PHOTOS} photos
              {staged.length > 0 && ` · ${staged.length} pending upload`}
            </p>
          </Section>

          {/* 3. LOCATION */}
          <LocationFormSection
            form={form}
            update={update}
            canGeocode={canGeocode}
            geocodeFromAddress={geocodeFromAddress}
            applyPin={applyPin}
          />

          {/* 4. CONTACT */}
          <Section
            index={4}
            icon={Phone}
            title="Contact information"
            subtitle="How customers reach you."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone">
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => update("phone", e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </Field>
            </div>
          </Section>

          {/* 5. BOOKING SETTINGS */}
          <Section
            index={5}
            icon={Building2}
            title="Booking settings"
            subtitle="Customer-facing cancellation rules."
          >
            <Field label="Cancellation window (hours)">
              <input
                type="number"
                min={0}
                value={form.cancellation_window_hours}
                onChange={(e) =>
                  update("cancellation_window_hours", e.target.value)
                }
                placeholder="e.g. 24"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 sm:max-w-xs"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Customers can cancel up to this many hours before their reservation
                without a strike.
              </p>
            </Field>
          </Section>

          {/* 6. ADVANCED */}
          <section className="rounded-2xl border border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <Sliders size={18} />
                </div>
                <div>
                  <div className="font-semibold text-slate-900">
                    <span className="mr-1.5 text-slate-400">6.</span>
                    Advanced{" "}
                    <span className="font-normal text-slate-500">(optional)</span>
                  </div>
                  <p className="mt-0.5 text-sm text-slate-500">
                    Override coordinates manually if geocoding got it wrong.
                  </p>
                </div>
              </div>
              {advancedOpen ? (
                <ChevronUp size={18} className="text-slate-400" />
              ) : (
                <ChevronDown size={18} className="text-slate-400" />
              )}
            </button>
            {advancedOpen && (
              <div className="border-t border-slate-100 px-5 py-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Latitude">
                    <input
                      type="text"
                      value={form.latitude}
                      onChange={(e) => update("latitude", e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </Field>
                  <Field label="Longitude">
                    <input
                      type="text"
                      value={form.longitude}
                      onChange={(e) => update("longitude", e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </Field>
                </div>
              </div>
            )}
          </section>
      </div>

      {/* STICKY SAVE BAR */}
      <div className="sticky bottom-4 flex flex-col-reverse gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-end">
        <Link
          href={`/my-shops/${id}`}
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={!dirty || saving}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>

      {deletingPhotoId != null && (
        <ConfirmationDialog
          open
          title="Delete this photo?"
          description="The photo will be removed from your shop page. This can't be undone."
          variant="danger"
          confirmLabel="Delete photo"
          onConfirm={confirmDeletePhoto}
          onCancel={() => setDeletingPhotoId(null)}
        />
      )}
      {coverPromotionId != null && (
        <ConfirmationDialog
          open
          title="Set as cover photo?"
          description="This photo will be shown as the main image on your shop listing and detail page."
          variant="primary"
          confirmLabel="Set as cover"
          onConfirm={confirmSetCoverPhoto}
          onCancel={() => setCoverPromotionId(null)}
        />
      )}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </form>
  );
}

function Select({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-lg border border-slate-300 bg-white px-3 py-2 pr-9 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      >
        {placeholder && !value && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={16}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
      />
    </div>
  );
}

const inputClasses =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

/** Input with a leading icon in a small slot — used for the two address lines. */
function IconInput({
  icon: Icon,
  value,
  onChange,
  placeholder,
  required,
  type = "text",
}: {
  icon: typeof MapPin;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <div className="relative">
      <Icon
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
      />
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className={`${inputClasses} pl-9`}
      />
    </div>
  );
}

/**
 * Location section — title at the top, then a 2-column layout (form fields
 * on the left, interactive map on the right). Matches the new mockup; uses
 * the same rounded-2xl/border styling as the FormSection-based sections.
 */
function LocationFormSection({
  form,
  update,
  canGeocode,
  geocodeFromAddress,
  applyPin,
}: {
  form: FormValues;
  update: <K extends keyof FormValues>(k: K, v: FormValues[K]) => void;
  canGeocode: boolean;
  geocodeFromAddress: () => Promise<void>;
  applyPin: (result: PinResult) => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="mb-5 flex items-start gap-4">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <MapPin size={18} />
        </div>
        <div>
          <div className="font-semibold text-slate-900">
            <span className="mr-1.5 text-slate-400">3.</span>
            Location
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            Add your shop&rsquo;s address details so customers can find you easily.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* LEFT: address fields */}
        <div className="space-y-4">
          <Field label="Address line 1" required>
            <IconInput
              icon={MapPin}
              value={form.address_line}
              onChange={(v) => update("address_line", v)}
              placeholder="e.g. 8572 Winding Creek Boulevard"
              required
            />
          </Field>
          <Field label="Address line 2">
            <IconInput
              icon={Building}
              value={form.address_line_2}
              onChange={(v) => update("address_line_2", v)}
              placeholder="Apartment, suite, building, floor, etc. (optional)"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Country" required>
              <Select
                value={form.country}
                onChange={(v) => update("country", v)}
                placeholder="Select country"
                options={[
                  { value: "", label: "Select country", disabled: true },
                  ...COUNTRIES.map((c) => ({ value: c, label: c })),
                ]}
              />
            </Field>
            <Field label="State / Province" required>
              <input
                type="text"
                value={form.state_province}
                onChange={(e) => update("state_province", e.target.value)}
                placeholder="e.g. Metro Manila"
                required
                className={inputClasses}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="City / Municipality" required>
              <input
                type="text"
                value={form.city}
                onChange={(e) => update("city", e.target.value)}
                placeholder="e.g. Iligan"
                required
                className={inputClasses}
              />
            </Field>
            <Field label="Barangay / District">
              <input
                type="text"
                value={form.barangay}
                onChange={(e) => update("barangay", e.target.value)}
                placeholder="e.g. Pala-o"
                className={inputClasses}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ZIP / Postal Code" required>
              <input
                type="text"
                value={form.postal_code}
                onChange={(e) => update("postal_code", e.target.value)}
                placeholder="e.g. 9200"
                required
                className={inputClasses}
              />
            </Field>
            <Field label="Landmark">
              <input
                type="text"
                value={form.landmark}
                onChange={(e) => update("landmark", e.target.value)}
                placeholder="Nearby landmark (optional)"
                className={inputClasses}
              />
            </Field>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="block text-sm font-medium text-slate-700">
                Coordinates{" "}
                <span className="font-normal text-slate-500">(optional)</span>
              </span>
              <button
                type="button"
                onClick={geocodeFromAddress}
                disabled={!canGeocode}
                className="text-xs font-medium text-brand-600 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Use address coordinates
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Latitude">
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.latitude}
                  onChange={(e) => update("latitude", e.target.value)}
                  placeholder="e.g. 8.2414"
                  className={inputClasses}
                />
              </Field>
              <Field label="Longitude">
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.longitude}
                  onChange={(e) => update("longitude", e.target.value)}
                  placeholder="e.g. 124.2470"
                  className={inputClasses}
                />
              </Field>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              Leave blank to auto-capture from the map pin.
            </p>
          </div>
        </div>

        {/* RIGHT: interactive map */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <LocationPicker
            lat={form.latitude}
            lng={form.longitude}
            onApplyPin={applyPin}
          />
        </div>
      </div>
    </section>
  );
}

