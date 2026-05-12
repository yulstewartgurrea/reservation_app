"use client";

import { FormEvent, useState } from "react";
import { formatApiError } from "@/lib/errors";

export type ServiceFormValues = {
  name: string;
  description: string;
  duration_minutes: string;
  buffer_minutes: string;
  price: string;
  is_active: boolean;
};

export function emptyServiceForm(): ServiceFormValues {
  return {
    name: "",
    description: "",
    duration_minutes: "30",
    buffer_minutes: "0",
    price: "0",
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
