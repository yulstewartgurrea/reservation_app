"use client";

/**
 * Edit-service form.
 *
 * Layout mirrors the New Service page:
 * - Form card on TOP at full width — fields get maximum horizontal room.
 * - Booking-settings collapsible below the form.
 * - Photos card at the bottom (existing gallery + upload affordance).
 * - Sticky footer pairs the destructive "Delete service" action on the left
 *   with Cancel / Save changes on the right.
 *
 * Photos here are uploaded immediately (unlike the create flow, where they're
 * staged) — the service already exists, so each upload appends a row right
 * away. Same goes for deleting individual photos.
 */

import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUrlParams } from "@/lib/useUrlParams";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  ImagePlus,
  Info as InfoIcon,
  MapPin,
  MoreHorizontal,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/errors";
import { iconForService } from "@/lib/serviceIcons";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { PageHeader } from "@/components/PageHeader";
import { Toast, ToastMessage } from "@/components/Toast";

type Service = {
  id: number;
  shop: number;
  name: string;
  description: string;
  duration_minutes: number;
  buffer_minutes: number;
  price: string;
  max_quantity: number;
  unit_label: string;
  inter_unit_buffer_minutes: number;
  is_active: boolean;
  category: number | null;
  cover_photo: string | null;
  gallery: Photo[];
};

type Category = { id: number; name: string };
type Photo = {
  id: number;
  image: string;
  caption: string;
  sort_order: number;
  is_primary: boolean;
};
type Shop = { id: number; name: string; city: string; country: string };

type FormValues = {
  name: string;
  description: string;
  duration_minutes: string;
  buffer_minutes: string;
  price: string;
  category: string;
  max_quantity: string;
  unit_label: string;
  inter_unit_buffer_minutes: string;
  is_active: boolean;
};

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120, 180];
const BUFFER_OPTIONS = [0, 5, 10, 15, 30, 45, 60];
const MAX_PHOTOS = 8;

export default function EditServicePage() {
  const router = useRouter();
  const { id, serviceId } = useUrlParams<{ id: string; serviceId: string }>(
    "/my-shops/[id]/services/[serviceId]/edit"
  );

  const [service, setService] = useState<Service | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<FormValues | null>(null);
  const [original, setOriginal] = useState<FormValues | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function loadAll() {
    if (!serviceId || !id) return;
    try {
      const [svcRes, shopRes, catRes] = await Promise.all([
        api.get(`/services/${serviceId}/`),
        api.get(`/shops/${id}/`),
        api.get(`/services/categories/`),
      ]);
      const s: Service = svcRes.data;
      setService(s);
      setShop(shopRes.data);
      setCategories(catRes.data.results ?? catRes.data);
      const v: FormValues = {
        name: s.name ?? "",
        description: s.description ?? "",
        duration_minutes: String(s.duration_minutes ?? 30),
        buffer_minutes: String(s.buffer_minutes ?? 0),
        price: String(s.price ?? ""),
        category: s.category ? String(s.category) : "",
        max_quantity: String(s.max_quantity ?? 1),
        unit_label: s.unit_label ?? "unit",
        inter_unit_buffer_minutes: String(s.inter_unit_buffer_minutes ?? 0),
        is_active: s.is_active,
      };
      setForm(v);
      setOriginal(v);
    } catch (err) {
      setToast({ variant: "error", message: formatApiError(err, "Failed to load.") });
    }
  }

  useEffect(() => {
    if (!serviceId) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId]);

  const dirty = useMemo(() => {
    if (!form || !original) return false;
    return JSON.stringify(form) !== JSON.stringify(original);
  }, [form, original]);

  function update<K extends keyof FormValues>(k: K, v: FormValues[K]) {
    setForm((prev) => (prev ? { ...prev, [k]: v } : prev));
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        description: form.description,
        duration_minutes: Number(form.duration_minutes),
        buffer_minutes: Number(form.buffer_minutes),
        price: form.price,
        category: form.category ? Number(form.category) : null,
        max_quantity: Math.max(1, Number(form.max_quantity) || 1),
        unit_label: form.unit_label.trim() || "unit",
        inter_unit_buffer_minutes: Math.max(
          0,
          Number(form.inter_unit_buffer_minutes) || 0
        ),
        is_active: form.is_active,
      };
      const { data } = await api.patch(`/services/${serviceId}/`, payload);
      setService(data);
      setOriginal(form);
      setToast({ variant: "success", message: "Changes saved." });
    } catch (err) {
      setToast({ variant: "error", message: formatApiError(err, "Failed to save.") });
    } finally {
      setSaving(false);
    }
  }

  async function uploadPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const data = new FormData();
      data.append("image", file);
      await api.post(`/services/${serviceId}/photos/`, data, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      loadAll();
    } catch (err) {
      setToast({ variant: "error", message: formatApiError(err, "Upload failed.") });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function deletePhoto(photoId: number) {
    try {
      await api.delete(`/services/${serviceId}/photos/${photoId}/`);
      loadAll();
    } catch (err) {
      setToast({ variant: "error", message: formatApiError(err) });
    }
  }

  async function makePrimary(photoId: number) {
    try {
      await api.post(`/services/${serviceId}/photos/${photoId}/primary/`);
      loadAll();
      setToast({ variant: "success", message: "Primary photo updated." });
    } catch (err) {
      setToast({ variant: "error", message: formatApiError(err) });
    }
  }

  async function deleteService() {
    try {
      await api.delete(`/services/${serviceId}/`);
      router.push(`/my-shops/${id}/services`);
    } catch (err) {
      setToast({ variant: "error", message: formatApiError(err) });
    }
  }

  if (!service || !form || !shop) {
    return <p className="py-10 text-center text-sm text-slate-500">Loading…</p>;
  }

  const Icon = iconForService(service.name);

  return (
    <form onSubmit={save} className="space-y-6 py-6">
      <PageHeader
        backHref={`/my-shops/${id}/services`}
        backLabel="Back to services"
        icon={Icon}
        title={`Edit ${service.name}`}
        description={shop.name}
        actions={
          dirty ? (
            <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Unsaved changes
            </span>
          ) : undefined
        }
      />

      {/* FORM — primary input; full width */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-6 flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <FileText size={20} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Edit service listing
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Update the details of your service.
            </p>
          </div>
        </div>

        <div className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Service title" required>
              <input
                type="text"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </Field>
            <Field label="Category" required>
              <Select
                value={form.category}
                onChange={(v) => update("category", v)}
                options={[
                  { value: "", label: "Uncategorized" },
                  ...categories.map((c) => ({
                    value: String(c.id),
                    label: c.name,
                  })),
                ]}
              />
            </Field>
          </div>

          <Field label="Description" required>
            <textarea
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              rows={5}
              required
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Price" required>
              <div className="flex items-center rounded-lg border border-slate-300 focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500">
                <span className="pl-3.5 pr-1 text-sm text-slate-500">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.price}
                  onChange={(e) => update("price", e.target.value)}
                  className="w-full bg-transparent px-1 py-2.5 text-sm focus:outline-none"
                />
              </div>
            </Field>
            <Field label="Duration" required>
              <Select
                value={form.duration_minutes}
                onChange={(v) => update("duration_minutes", v)}
                options={DURATION_OPTIONS.map((m) => ({
                  value: String(m),
                  label: `${m} min`,
                }))}
                icon={Clock}
              />
            </Field>
            <Field label="Service area / location" required>
              <div className="flex items-center rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700">
                <MapPin size={16} className="mr-2 text-slate-400" />
                {shop.city || "—"}
              </div>
            </Field>
            <Field
              label="Buffer time"
              tooltip="Time between bookings for cleanup or travel."
            >
              <Select
                value={form.buffer_minutes}
                onChange={(v) => update("buffer_minutes", v)}
                options={BUFFER_OPTIONS.map((m) => ({
                  value: String(m),
                  label: m === 0 ? "No buffer" : `${m} min`,
                }))}
              />
            </Field>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Max quantity per booking"
              tooltip="Max units a customer can book in one reservation; 1 hides the quantity selector. Time and price scale with quantity."
            >
              <input
                type="number"
                min={1}
                value={form.max_quantity}
                onChange={(e) => update("max_quantity", e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </Field>
            <Field
              label="Unit label"
              tooltip='What one unit is called, e.g. "person", "seat", "table". Pluralized automatically.'
            >
              <input
                type="text"
                value={form.unit_label}
                maxLength={20}
                onChange={(e) => update("unit_label", e.target.value)}
                placeholder="unit"
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </Field>
            <Field
              label="Gap between units (min)"
              tooltip="Extra minutes between each unit for multi-unit bookings (e.g. moving between aircon units). Not applied for single-unit bookings."
            >
              <input
                type="number"
                min={0}
                value={form.inter_unit_buffer_minutes}
                onChange={(e) =>
                  update("inter_unit_buffer_minutes", e.target.value)
                }
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </Field>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <span className="text-sm font-medium text-slate-900">
                Accepting bookings
              </span>
              <p className="text-xs text-slate-500">
                Turn off to hide this service from customers.
              </p>
            </div>
            <ToggleSwitch
              checked={form.is_active}
              onChange={(v) => update("is_active", v)}
            />
          </div>
        </div>
      </section>

      {/* BOOKING SETTINGS — collapsible */}
      <section className="rounded-2xl border border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => setBookingOpen((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-4 text-left"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <Clock size={16} />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">
                Booking settings &amp; visibility
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                Control how this service is shown and booked.
              </p>
            </div>
          </div>
          {bookingOpen ? (
            <ChevronUp size={18} className="text-slate-400" />
          ) : (
            <ChevronDown size={18} className="text-slate-400" />
          )}
        </button>
        {bookingOpen && (
          <div className="space-y-3 border-t border-slate-100 px-5 py-4 text-sm text-slate-600">
            <p>
              Service appears in your shop&apos;s public catalog once the shop
              itself is <span className="font-medium">active</span>.
            </p>
            <p>
              Use the availability toggle above to temporarily hide this service
              without removing it.
            </p>
          </div>
        )}
      </section>

      {/* PHOTOS — below the form */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <Sparkles size={18} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Service photos
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Showcase your service with high-quality images. Up to {MAX_PHOTOS}.
            </p>
          </div>
        </div>

        {service.gallery.length > 0 && (
          <ul className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {service.gallery.map((p) => (
              <GalleryItem
                key={p.id}
                photo={p}
                serviceName={service.name}
                onMakePrimary={() => makePrimary(p.id)}
                onDelete={() => deletePhoto(p.id)}
              />
            ))}
          </ul>
        )}

        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand-200 bg-brand-50/30 py-8 text-center hover:bg-brand-50/60">
          <input
            type="file"
            accept="image/*"
            onChange={uploadPhoto}
            className="sr-only"
            disabled={uploading || service.gallery.length >= MAX_PHOTOS}
          />
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-brand-700">
            <ImagePlus size={20} />
          </div>
          <span className="text-sm font-semibold text-slate-900">
            {uploading ? "Uploading…" : service.gallery.length === 0 ? "Add photos" : "Add more photos"}
          </span>
          <span className="text-xs text-slate-500">
            PNG or JPG · {service.gallery.length} of {MAX_PHOTOS} used
          </span>
          <span className="mt-1 rounded-md border border-brand-200 bg-white px-3 py-1.5 text-xs font-medium text-brand-700">
            Browse files
          </span>
        </label>
      </section>

      {/* STICKY ACTION BAR — Delete on the left, Cancel/Save on the right */}
      <div className="sticky bottom-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-red-700 hover:underline"
        >
          <Trash2 size={16} />
          Delete service
          <span className="ml-2 hidden text-xs font-normal text-slate-500 sm:inline">
            This action cannot be undone.
          </span>
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/my-shops/${id}/services`}
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={!dirty || saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      {confirmingDelete && (
        <ConfirmationDialog
          open
          title="Delete this service?"
          description="Past reservations using this service stay intact, but customers won't be able to book it anymore."
          variant="danger"
          confirmLabel="Delete service"
          onConfirm={deleteService}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </form>
  );
}

/**
 * Photo tile in the service gallery. Mirrors the kebab pattern used by
 * `ServiceCard` — actions live behind a `...` menu in the top-right so the
 * tile body stays focused on the image.
 */
function GalleryItem({
  photo,
  serviceName,
  onMakePrimary,
  onDelete,
}: {
  photo: Photo;
  serviceName: string;
  onMakePrimary: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <li
      className={`relative overflow-hidden rounded-xl border bg-slate-100 ${
        photo.is_primary
          ? "border-amber-400 ring-2 ring-amber-300/60"
          : "border-slate-200"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.image}
        alt={photo.caption || serviceName}
        className="aspect-[4/3] w-full object-cover"
      />

      {photo.is_primary && (
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white shadow">
          <Star size={11} fill="currentColor" strokeWidth={0} />
          Primary
        </span>
      )}

      <div ref={menuRef} className="absolute right-2 top-2">
        <button
          type="button"
          aria-label="More options"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-slate-600 shadow-sm hover:bg-slate-50"
        >
          <MoreHorizontal size={16} />
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-full z-10 mt-1 w-40 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg"
          >
            {!photo.is_primary && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onMakePrimary();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <Star size={14} />
                Set as primary
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onDelete();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

function Field({
  label,
  required,
  tooltip,
  children,
}: {
  label: string;
  required?: boolean;
  tooltip?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500">*</span>}
        {tooltip && (
          <span title={tooltip} className="cursor-help text-slate-400">
            <InfoIcon size={13} />
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
  icon: Icon,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  icon?: typeof Clock;
}) {
  return (
    <div className="relative">
      {Icon && (
        <Icon
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full appearance-none rounded-lg border border-slate-300 bg-white py-2.5 pr-9 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 ${
          Icon ? "pl-9" : "pl-3.5"
        }`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
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

function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex flex-shrink-0 items-center justify-start"
    >
      <span
        aria-hidden
        className={`relative inline-block h-6 w-11 rounded-full transition-colors ${
          checked ? "bg-brand-600" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] duration-150 ${
            checked ? "left-[22px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}
