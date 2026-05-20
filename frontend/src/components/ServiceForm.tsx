"use client";

import { FormEvent, useState } from "react";
import { formatApiError } from "@/lib/errors";

export type ServiceFormValues = {
  name: string;
  description: string;
  duration_minutes: string;
  buffer_minutes: string;
  price: string;
  max_quantity: string;
  unit_label: string;
  inter_unit_buffer_minutes: string;
  is_active: boolean;
};

export function emptyServiceForm(): ServiceFormValues {
  return {
    name: "",
    description: "",
    duration_minutes: "30",
    buffer_minutes: "0",
    price: "0",
    max_quantity: "1",
    unit_label: "unit",
    inter_unit_buffer_minutes: "0",
    is_active: true,
  };
}

export function ServiceForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial: ServiceFormValues;
  submitLabel: string;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
}) {
  const [form, setForm] = useState<ServiceFormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function update<K extends keyof ServiceFormValues>(k: K, v: ServiceFormValues[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        name: form.name,
        description: form.description,
        duration_minutes: Number(form.duration_minutes),
        buffer_minutes: Number(form.buffer_minutes),
        price: form.price,
        max_quantity: Math.max(1, Number(form.max_quantity) || 1),
        unit_label: form.unit_label.trim() || "unit",
        inter_unit_buffer_minutes: Math.max(
          0,
          Number(form.inter_unit_buffer_minutes) || 0
        ),
        is_active: form.is_active,
      });
    } catch (err) {
      setError(formatApiError(err, "Failed to save."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium">Name</label>
        <input
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
          required
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </div>
      <div>
        <label className="block text-sm font-medium">Description</label>
        <textarea
          value={form.description}
          onChange={(e) => update("description", e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-sm font-medium">Duration (min)</label>
          <input
            type="number"
            min={5}
            value={form.duration_minutes}
            onChange={(e) => update("duration_minutes", e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Buffer (min)</label>
          <input
            type="number"
            min={0}
            value={form.buffer_minutes}
            onChange={(e) => update("buffer_minutes", e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Price</label>
          <input
            value={form.price}
            onChange={(e) => update("price", e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium">Max quantity per booking</label>
          <input
            type="number"
            min={1}
            value={form.max_quantity}
            onChange={(e) => update("max_quantity", e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
          <p className="mt-1 text-xs text-slate-500">
            Set the max units customers can book in one reservation. 1 hides the
            quantity selector.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium">Unit label</label>
          <input
            value={form.unit_label}
            maxLength={20}
            onChange={(e) => update("unit_label", e.target.value)}
            placeholder="unit"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
          <p className="mt-1 text-xs text-slate-500">
            What one unit is called, e.g. &quot;person&quot;, &quot;seat&quot;,
            &quot;table&quot;. Pluralized automatically.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium">
            Gap between units (min)
          </label>
          <input
            type="number"
            min={0}
            value={form.inter_unit_buffer_minutes}
            onChange={(e) =>
              update("inter_unit_buffer_minutes", e.target.value)
            }
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
          <p className="mt-1 text-xs text-slate-500">
            Extra minutes between each unit for multi-unit bookings (e.g.
            moving between aircon units). Not applied for single-unit
            bookings.
          </p>
        </div>
      </div>
      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.is_active}
          onChange={(e) => update("is_active", e.target.checked)}
        />
        Active (customers can book)
      </label>
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
