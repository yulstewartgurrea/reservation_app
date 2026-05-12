"use client";

import { FormEvent, useState } from "react";
import { formatApiError } from "@/lib/errors";

export type ShopFormValues = {
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

export function emptyShopForm(): ShopFormValues {
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
    cancellation_window_hours: "",
  };
}

export function ShopForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial: ShopFormValues;
  submitLabel: string;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
}) {
  const [form, setForm] = useState<ShopFormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function update<K extends keyof ShopFormValues>(k: K, v: ShopFormValues[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { ...form };
      payload.latitude = form.latitude ? Number(form.latitude) : null;
      payload.longitude = form.longitude ? Number(form.longitude) : null;
      payload.cancellation_window_hours = form.cancellation_window_hours
        ? Number(form.cancellation_window_hours)
        : null;
      await onSubmit(payload);
    } catch (err) {
      setError(formatApiError(err, "Failed to save."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Name" value={form.name} onChange={(v) => update("name", v)} required />
      <Field
        label="Description"
        value={form.description}
        onChange={(v) => update("description", v)}
        textarea
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Address"
          value={form.address_line}
          onChange={(v) => update("address_line", v)}
          required
        />
        <Field label="City" value={form.city} onChange={(v) => update("city", v)} required />
        <Field
          label="Postal code"
          value={form.postal_code}
          onChange={(v) => update("postal_code", v)}
        />
        <Field label="Country" value={form.country} onChange={(v) => update("country", v)} />
        <Field label="Phone" value={form.phone} onChange={(v) => update("phone", v)} />
        <Field
          label="Email"
          type="email"
          value={form.email}
          onChange={(v) => update("email", v)}
        />
        <Field
          label="Latitude (auto-filled if blank)"
          value={form.latitude}
          onChange={(v) => update("latitude", v)}
        />
        <Field
          label="Longitude (auto-filled if blank)"
          value={form.longitude}
          onChange={(v) => update("longitude", v)}
        />
        <Field
          label="Cancellation window (hours)"
          value={form.cancellation_window_hours}
          onChange={(v) => update("cancellation_window_hours", v)}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-md bg-brand-600 px-4 py-2 text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {saving ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  textarea?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      )}
    </div>
  );
}
