"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, Clock, ImagePlus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/errors";
import { iconForService } from "@/lib/serviceIcons";
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
    is_active: true,
  };
}

export default function NewServicePage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [shop, setShop] = useState<Shop | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<FormValues>(emptyForm());
  const [photos, setPhotos] = useState<StagedPhoto[]>([]);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
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

  async function save() {
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
        is_active: form.is_active,
      };
      const { data: created } = await api.post(`/services/`, payload);

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

      router.push(`/dashboard/shops/${id}`);
    } catch (err) {
      setToast({ variant: "error", message: formatApiError(err, "Failed to create service.") });
      setSaving(false);
    }
  }

  if (!shop) {
    return <p className="py-10 text-center text-sm text-slate-500">Loading…</p>;
  }

  return (
    <div className="space-y-4 py-4">
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
        <div className="w-[88px]" />
      </header>

      <div className="grid gap-4 lg:grid-cols-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-3">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Service photos</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Add photos now — they&apos;ll be uploaded when you create the service.
            </p>
          </div>

          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                  className="absolute right-2 top-2 rounded-full bg-white/95 p-1.5 text-slate-600 opacity-0 shadow transition group-hover:opacity-100 hover:bg-white hover:text-red-700"
                  aria-label="Remove photo"
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
              multiple
              onChange={addPhotos}
              className="sr-only"
              disabled={photos.length >= MAX_PHOTOS}
            />
            <ImagePlus size={28} className="text-slate-400" />
            <span className="font-medium text-slate-700">Add photo</span>
            <span className="text-xs text-slate-500">PNG or JPG · up to {MAX_PHOTOS} photos</span>
          </label>

          <p className="mt-3 text-center text-xs text-slate-500">
            {photos.length} of {MAX_PHOTOS} photos staged.
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <h2 className="text-lg font-semibold">New service listing</h2>

          <div className="mt-5 space-y-4">
            <Field label="Service title">
              <input
                type="text"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="e.g. Cleaning and Maintenance"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </Field>

            <Field label="Description">
              <textarea
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                rows={4}
                placeholder="What does this service include?"
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
                    ...categories.map((c) => ({ value: String(c.id), label: c.name })),
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
                  options={DURATION_OPTIONS.map((m) => ({ value: String(m), label: `${m} min` }))}
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

      <div className="sticky bottom-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-end">
        <Link
          href={`/dashboard/shops/${id}`}
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
        >
          Cancel
        </Link>
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Creating…" : "Create service"}
        </button>
      </div>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
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
