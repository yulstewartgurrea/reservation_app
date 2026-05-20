"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  ImagePlus,
  MapPin,
  Phone,
  Sliders,
  Sparkles,
  Store,
  Trash2,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/errors";
import { SERVICE_FEE_TERMS } from "@/lib/billing";
import { FormField as Field, FormSection as Section } from "@/components/FormSection";
import { LocationMap, geocodeAddress } from "@/components/LocationMap";
import { SidebarCard } from "@/components/SidebarCard";
import { Toast, ToastMessage } from "@/components/Toast";

type FormValues = {
  name: string;
  description: string;
  address_line: string;
  city: string;
  postal_code: string;
  country: string;
  phone: string;
  email: string;
  latitude: string;
  longitude: string;
  cancellation_window_hours: string;
};

const DESCRIPTION_MAX = 500;

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

function empty(): FormValues {
  return {
    name: "",
    description: "",
    address_line: "",
    city: "",
    postal_code: "",
    country: "",
    phone: "",
    email: "",
    latitude: "",
    longitude: "",
    cancellation_window_hours: "24",
  };
}

type StepId = "basic" | "location" | "settings";

type StagedPhoto = { id: string; file: File; preview: string };

const MAX_PHOTOS = 8;

export default function NewShopPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormValues>(empty());
  const [photos, setPhotos] = useState<StagedPhoto[]>([]);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [saving, setSaving] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  function update<K extends keyof FormValues>(k: K, v: FormValues[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  // Revoke object URLs on unmount so previews don't leak.
  useEffect(() => {
    return () => {
      photos.forEach((p) => URL.revokeObjectURL(p.preview));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  /** Progress tracker — purely visual. A step is "complete" once its
   * required fields are filled in. */
  const progress: Record<StepId, "active" | "complete" | "todo"> = useMemo(() => {
    const basicDone = form.name.trim().length > 0;
    const locationDone =
      form.address_line.trim() && form.city.trim() && form.country.trim();
    const settingsDone = form.cancellation_window_hours.trim().length > 0;
    return {
      basic: basicDone ? "complete" : "active",
      location: locationDone ? "complete" : basicDone ? "active" : "todo",
      settings: settingsDone && locationDone ? "complete" : locationDone ? "active" : "todo",
    };
  }, [form]);

  const canGeocode = Boolean(
    form.address_line.trim() && form.city.trim() && form.country.trim()
  );

  async function geocodeFromAddress() {
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
    setForm((prev) => ({
      ...prev,
      latitude: result.lat.toFixed(6),
      longitude: result.lng.toFixed(6),
    }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
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
      const { data: created } = await api.post("/shops/", payload);

      for (const p of photos) {
        const fd = new FormData();
        fd.append("image", p.file);
        try {
          await api.post(`/shops/${created.id}/photos/`, fd, {
            headers: { "Content-Type": "multipart/form-data" },
          });
        } catch (err) {
          setToast({
            variant: "error",
            message: formatApiError(err, `Failed to upload "${p.file.name}".`),
          });
        }
      }

      router.push(`/my-shops/${created.id}/hours`);
    } catch (err) {
      setToast({ variant: "error", message: formatApiError(err, "Failed to create shop.") });
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 py-4">
      {/* HEADER */}
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Create new shop</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Coordinates auto-fill from the address if you leave them blank.
          </p>
        </div>
        <ol className="flex items-center gap-3 text-sm">
          <StepDot index={1} label="Basic info" state={progress.basic} />
          <span className="h-px w-6 bg-slate-200" aria-hidden />
          <StepDot index={2} label="Location" state={progress.location} />
          <span className="h-px w-6 bg-slate-200" aria-hidden />
          <StepDot index={3} label="Booking settings" state={progress.settings} />
        </ol>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* LEFT: numbered sections */}
        <div className="space-y-4 lg:col-span-2">
          {/* 1. BASIC INFORMATION */}
          <Section
            index={1}
            icon={Store}
            title="Basic information"
            subtitle="Tell us about your shop."
          >
            <Field label="Shop name" required>
              <input
                type="text"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="e.g. Downtown Beauty Studio"
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
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
                  placeholder="Describe your shop, services, and what makes it special…"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <span className="pointer-events-none absolute bottom-2 right-3 text-xs text-slate-400">
                  {form.description.length} / {DESCRIPTION_MAX}
                </span>
              </div>
            </Field>
          </Section>

          {/* 2. SHOP PHOTOS */}
          <Section
            index={2}
            icon={ImageIcon}
            title="Shop photos"
            subtitle="Add photos now — they'll be uploaded when you create the shop."
          >
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
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
            <label className="mt-2 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 py-8 text-sm text-slate-600 hover:bg-slate-50">
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
              <span className="text-xs text-slate-500">
                PNG or JPG · up to {MAX_PHOTOS} photos
              </span>
            </label>
            <p className="mt-2 text-center text-xs text-slate-500">
              {photos.length} of {MAX_PHOTOS} photos staged.
            </p>
          </Section>

          {/* 3. LOCATION */}
          <Section
            index={3}
            icon={MapPin}
            title="Location"
            subtitle="Add your shop address. Coordinates auto-fill from the address."
          >
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Address" required>
                    <input
                      type="text"
                      value={form.address_line}
                      onChange={(e) => update("address_line", e.target.value)}
                      placeholder="e.g. 123 Main Street"
                      required
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </Field>
                  <Field label="City" required>
                    <input
                      type="text"
                      value={form.city}
                      onChange={(e) => update("city", e.target.value)}
                      placeholder="e.g. New York"
                      required
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </Field>
                  <Field label="Postal code">
                    <input
                      type="text"
                      value={form.postal_code}
                      onChange={(e) => update("postal_code", e.target.value)}
                      placeholder="e.g. 10001"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </Field>
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
                </div>
              </div>
              <div className="lg:col-span-1">
                <LocationMap
                  lat={form.latitude}
                  lng={form.longitude}
                  canGeocode={canGeocode}
                  onUseAddress={geocodeFromAddress}
                />
              </div>
            </div>
          </Section>

          {/* 4. CONTACT INFORMATION */}
          <Section
            index={4}
            icon={Phone}
            title="Contact information"
            subtitle="How can customers reach you?"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone">
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => update("phone", e.target.value)}
                  placeholder="e.g. +1 555 123 4567"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  placeholder="e.g. hello@yourshop.com"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </Field>
            </div>
          </Section>

          {/* 5. BOOKING SETTINGS */}
          <Section
            index={5}
            icon={Building2}
            title="Booking settings"
            subtitle="Set your cancellation policy."
          >
            <Field label="Cancellation window (hours)" required>
              <input
                type="number"
                min={0}
                value={form.cancellation_window_hours}
                onChange={(e) =>
                  update("cancellation_window_hours", e.target.value)
                }
                placeholder="e.g. 24"
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 sm:max-w-xs"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Customers can cancel up to this many hours before their reservation.
              </p>
            </Field>
          </Section>

          {/* 6. ADVANCED (collapsible) */}
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
                    Provide coordinates manually if needed.
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
                  <Field label="Latitude (optional)">
                    <input
                      type="text"
                      value={form.latitude}
                      onChange={(e) => update("latitude", e.target.value)}
                      placeholder="e.g. 40.7128"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </Field>
                  <Field label="Longitude (optional)">
                    <input
                      type="text"
                      value={form.longitude}
                      onChange={(e) => update("longitude", e.target.value)}
                      placeholder="e.g. -74.0060"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </Field>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* RIGHT: sidebar cards */}
        <aside className="space-y-4 lg:col-span-1">
          <SidebarCard
            tone="brand"
            icon={Sparkles}
            title="Tip"
            body="A complete profile helps customers trust your shop and makes it easier to find you."
          />
          <SidebarCard
            tone="slate"
            title="Why this matters"
            bullets={[
              "Complete information builds trust with your customers.",
              "Accurate location helps customers find you easily.",
              "Clear booking settings reduce no-shows and confusion.",
            ]}
          />
        </aside>
      </div>

      {/* SERVICE-FEE NOTICE — non-dismissable; shown before submit */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">Service fee &amp; billing</p>
        <p className="mt-1">{SERVICE_FEE_TERMS}</p>
        <p className="mt-1 text-amber-800">
          By creating a shop you agree to these billing terms. You can review
          invoices anytime under{" "}
          <span className="font-medium">Billing</span>.
        </p>
      </div>

      {/* STICKY BOTTOM BAR */}
      <div className="sticky bottom-4 flex flex-col-reverse gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-end">
        <Link
          href="/my-shops"
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={saving || !form.name.trim()}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Store size={16} />
          {saving ? "Creating…" : "Create shop"}
        </button>
      </div>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </form>
  );
}

function StepDot({
  index,
  label,
  state,
}: {
  index: number;
  label: string;
  state: "active" | "complete" | "todo";
}) {
  const dotClass =
    state === "complete"
      ? "bg-emerald-500 text-white"
      : state === "active"
        ? "bg-brand-600 text-white"
        : "bg-slate-200 text-slate-500";
  const labelClass =
    state === "todo" ? "text-slate-400" : "text-slate-700 font-medium";
  return (
    <li className="flex items-center gap-2">
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${dotClass}`}
      >
        {state === "complete" ? "✓" : index}
      </span>
      <span className={`hidden sm:inline ${labelClass}`}>{label}</span>
    </li>
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


