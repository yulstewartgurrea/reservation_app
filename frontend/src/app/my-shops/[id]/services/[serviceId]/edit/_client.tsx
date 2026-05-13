"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  Clock,
  ImagePlus,
  Trash2,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/errors";
import { iconForService } from "@/lib/serviceIcons";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { Toast, ToastMessage } from "@/components/Toast";

type Service = {
  id: number;
  shop: number;
  name: string;
  description: string;
  duration_minutes: number;
  buffer_minutes: number;
  price: string;
  is_active: boolean;
  category: number | null;
  cover_photo: string | null;
  gallery: Photo[];
};

type Category = { id: number; name: string };
type Photo = { id: number; image: string; caption: string; sort_order: number };
type Shop = { id: number; name: string; city: string; country: string };

type FormValues = {
  name: string;
  description: string;
  duration_minutes: string;
  buffer_minutes: string;
  price: string;
  category: string; // "" or category id
  is_active: boolean;
};

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120, 180];
const BUFFER_OPTIONS = [0, 5, 10, 15, 30, 45, 60];

export default function EditServicePage() {
  const router = useRouter();
  const { id, serviceId } = useParams<{ id: string; serviceId: string }>();

  const [service, setService] = useState<Service | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<FormValues | null>(null);
  const [original, setOriginal] = useState<FormValues | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function loadAll() {
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
        is_active: s.is_active,
      };
      setForm(v);
      setOriginal(v);
    } catch (err) {
      setToast({ variant: "error", message: formatApiError(err, "Failed to load.") });
    }
  }

  useEffect(() => {
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

  async function save() {
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

  async function deleteService() {
    try {
      await api.delete(`/services/${serviceId}/`);
      router.push(`/dashboard/shops/${id}`);
    } catch (err) {
      setToast({ variant: "error", message: formatApiError(err) });
    }
  }

  if (!service || !form || !shop) {
    return <p className="py-10 text-center text-sm text-slate-500">Loading…</p>;
  }

  const Icon = iconForService(service.name);

  return (
    <div className="space-y-4 py-4">
      {/* TOP BAR */}
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <Link
          href={`/dashboard/shops/${id}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft size={16} />
          All services
        </Link>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-600 text-white">
            <Icon size={16} />
          </div>
          <span className="font-semibold text-slate-900">{shop.name}</span>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Unsaved changes
            </span>
          )}
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* LEFT: PHOTOS */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-3">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Service photos</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Showcase your service with high-quality images.
              </p>
            </div>
          </div>

          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {service.gallery.map((p) => (
              <li
                key={p.id}
                className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.image}
                  alt={p.caption || service.name}
                  className="aspect-[4/3] w-full object-cover"
                />
                <button
                  onClick={() => deletePhoto(p.id)}
                  className="absolute right-2 top-2 rounded-full bg-white/95 p-1.5 text-slate-600 opacity-0 shadow transition group-hover:opacity-100 hover:bg-white hover:text-red-700"
                  aria-label="Delete photo"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>

          <label className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 py-8 text-sm text-slate-600 hover:bg-slate-50">
            <input
              type="file"
              accept="image/*"
              onChange={uploadPhoto}
              className="sr-only"
              disabled={uploading || service.gallery.length >= 8}
            />
            <ImagePlus size={28} className="text-slate-400" />
            <span className="font-medium text-slate-700">
              {uploading ? "Uploading…" : "Add photo"}
            </span>
            <span className="text-xs text-slate-500">PNG or JPG · up to 8 photos</span>
          </label>

          <p className="mt-3 text-center text-xs text-slate-500">
            {service.gallery.length} of 8 photos used.
          </p>
        </section>

        {/* RIGHT: FORM */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <h2 className="text-lg font-semibold">Edit service listing</h2>

          <div className="mt-5 space-y-4">
            <Field label="Service title">
              <input
                type="text"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </Field>

            <Field label="Description">
              <textarea
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Location">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {shop.city || "—"}
                </div>
              </Field>
              <Field label="Category">
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

            <div className="grid grid-cols-2 gap-3">
              <Field label="Price">
                <div className="flex items-center rounded-lg border border-slate-300 focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500">
                  <span className="pl-3 pr-1 text-sm text-slate-500">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.price}
                    onChange={(e) => update("price", e.target.value)}
                    className="w-full bg-transparent px-1 py-2 text-sm focus:outline-none"
                  />
                </div>
              </Field>
              <Field label="Duration">
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
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Availability">
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.is_active}
                  onClick={() => update("is_active", !form.is_active)}
                  className="flex h-[42px] w-full cursor-pointer items-center justify-between rounded-lg border border-slate-300 px-3 text-sm hover:bg-slate-50"
                >
                  <span className="text-slate-700">
                    {form.is_active ? "Accepting" : "Paused"}
                  </span>
                  <Toggle checked={form.is_active} />
                </button>
              </Field>
              <Field label="Buffer time">
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

            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <Info label="Hosted by" value={shop.name} />
                <Info label="Service area" value={shop.city || "—"} />
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* BOTTOM BAR */}
      <div className="sticky bottom-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <button
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
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
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
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
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

function Toggle({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: 44, height: 24, flex: "0 0 44px" }}
      className={`relative block rounded-full transition-colors ${
        checked ? "bg-brand-600" : "bg-slate-300"
      }`}
    >
      <span
        style={{ width: 20, height: 20, top: 2, left: checked ? 22 : 2 }}
        className="absolute rounded-full bg-white shadow transition-all"
      />
    </span>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm font-medium text-slate-900">{value}</div>
    </div>
  );
}
