"use client";

/**
 * New-service form.
 *
 * Layout:
 * - Form card on TOP at full width — service details are the primary input
 *   and benefit most from horizontal real estate (description textarea, side-
 *   by-side number fields, etc).
 * - Photos card BELOW at full width — staged locally and only uploaded after
 *   the service is created successfully. This avoids orphan ServicePhoto rows
 *   when service creation fails halfway.
 * - A sticky footer keeps Cancel / Create reachable while scrolling.
 */

import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useMemo,
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
  Sparkles,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/errors";
import { iconForService } from "@/lib/serviceIcons";
import { PageHeader } from "@/components/PageHeader";
import { Toast, ToastMessage } from "@/components/Toast";

type Category = { id: number; name: string };
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

type StagedPhoto = { id: string; file: File; preview: string };

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120, 180];
const BUFFER_OPTIONS = [0, 5, 10, 15, 30, 45, 60];
const MAX_PHOTOS = 8;

function emptyForm(): FormValues {
  return {
    name: "",
    description: "",
    duration_minutes: "30",
    buffer_minutes: "0",
    price: "0",
    category: "",
    max_quantity: "1",
    unit_label: "unit",
    inter_unit_buffer_minutes: "0",
    is_active: true,
  };
}

export default function NewServicePage() {
  const router = useRouter();
  const { id } = useUrlParams<{ id: string }>("/my-shops/[id]/services/new");

  const [shop, setShop] = useState<Shop | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<FormValues>(emptyForm());
  const [photos, setPhotos] = useState<StagedPhoto[]>([]);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [saving, setSaving] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    async function load() {
      try {
        const [shopRes, catRes] = await Promise.all([
          api.get(`/shops/${id}/`),
          api.get(`/services/categories/`),
        ]);
        setShop(shopRes.data);
        setCategories(catRes.data.results ?? catRes.data);
      } catch (err) {
        setToast({ variant: "error", message: formatApiError(err, "Failed to load.") });
      }
    }
    load();
  }, [id]);

  useEffect(() => {
    return () => {
      photos.forEach((p) => URL.revokeObjectURL(p.preview));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const Icon = useMemo(() => iconForService(form.name || "service"), [form.name]);

  function update<K extends keyof FormValues>(k: K, v: FormValues[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function addPhotos(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const remaining = MAX_PHOTOS - photos.length;
    const accepted = files.slice(0, remaining).map((file) => ({
      id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      preview: URL.createObjectURL(file),
    }));
    setPhotos((prev) => [...prev, ...accepted]);
    e.target.value = "";
  }

  function removePhoto(stagedId: string) {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === stagedId);
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((p) => p.id !== stagedId);
    });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setToast({ variant: "error", message: "Service title is required." });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        shop: Number(id),
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
      const { data: created } = await api.post(`/services/`, payload);

      // Upload staged photos sequentially so we can surface per-file errors
      // without losing the newly-created service.
      for (const p of photos) {
        const fd = new FormData();
        fd.append("image", p.file);
        try {
          await api.post(`/services/${created.id}/photos/`, fd, {
            headers: { "Content-Type": "multipart/form-data" },
          });
        } catch (err) {
          setToast({
            variant: "error",
            message: formatApiError(err, `Failed to upload "${p.file.name}".`),
          });
        }
      }

      router.push(`/my-shops/${id}/services`);
    } catch (err) {
      setToast({
        variant: "error",
        message: formatApiError(err, "Failed to create service."),
      });
      setSaving(false);
    }
  }

  if (!shop) {
    return <p className="py-10 text-center text-sm text-slate-500">Loading…</p>;
  }

  return (
    <form onSubmit={save} className="space-y-6 py-6">
      <PageHeader
        backHref={`/my-shops/${id}/services`}
        backLabel="Back to services"
        icon={Icon}
        title="New service"
        description={shop.name}
      />

      {/* FORM — primary input; full width so fields can breathe */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-6 flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <FileText size={20} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              New service listing
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Fill in the details of your service.
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
                placeholder="e.g. Cleaning and Maintenance"
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
              placeholder="What does this service include?"
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

      {/* PHOTOS — secondary; below the form */}
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
              Optional — add up to {MAX_PHOTOS} images to showcase this service.
            </p>
          </div>
        </div>

        {photos.length > 0 && (
          <ul className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((p) => (
              <li
                key={p.id}
                className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.preview}
                  alt={p.file.name}
                  className="aspect-[4/3] w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removePhoto(p.id)}
                  className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white text-slate-600 shadow hover:bg-white hover:text-red-700"
                  aria-label="Remove photo"
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand-200 bg-brand-50/30 py-8 text-center hover:bg-brand-50/60">
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={addPhotos}
            className="sr-only"
            disabled={photos.length >= MAX_PHOTOS}
          />
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-brand-700">
            <ImagePlus size={20} />
          </div>
          <span className="text-sm font-semibold text-slate-900">
            {photos.length === 0 ? "Add photos" : "Add more photos"}
          </span>
          <span className="text-xs text-slate-500">
            PNG or JPG · {photos.length} of {MAX_PHOTOS} used
          </span>
          <span className="mt-1 rounded-md border border-brand-200 bg-white px-3 py-1.5 text-xs font-medium text-brand-700">
            Browse files
          </span>
        </label>
      </section>

      {/* STICKY ACTION BAR */}
      <div className="sticky bottom-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-end">
        <Link
          href={`/my-shops/${id}/services`}
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Creating…" : "Create service"}
        </button>
      </div>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </form>
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
        className={`w-full appearance-none rounded-lg border border-slate-300 bg-white py-2 pr-9 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 ${
          Icon ? "pl-9" : "pl-3"
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

/**
 * Pill-style toggle. Outer button is the 44-px tap target (a11y); the inner
 * span is the visible 44×24 pill — same two-layer pattern used by the hours
 * editor to avoid the global min-h rule warping the visual.
 */
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
