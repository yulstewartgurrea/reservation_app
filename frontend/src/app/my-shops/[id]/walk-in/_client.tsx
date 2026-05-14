"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/errors";
import { nowDatetimeLocal } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";

type Service = { id: number; name: string; duration_minutes: number; price: string };

export default function WalkInPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [services, setServices] = useState<Service[]>([]);
  const [form, setForm] = useState({
    service: "",
    start_at: "",
    guest_name: "",
    guest_phone: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get(`/services/`, { params: { shop: id } }).then((r) =>
      setServices(r.data.results ?? r.data)
    );
  }, [id]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post("/reservations/walk-in/", {
        shop: Number(id),
        service: Number(form.service),
        start_at: new Date(form.start_at).toISOString(),
        guest_name: form.guest_name,
        guest_phone: form.guest_phone,
      });
      router.push(`/my-shops/${id}`);
    } catch (err) {
      setError(formatApiError(err, "Failed to create."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl py-6">
      <PageHeader
        backHref={`/my-shops/${id}`}
        backLabel="Back to shop"
        icon={UserPlus}
        title="Add walk-in"
        description="Manually create a booking for an in-person customer. No account required — just enter their name and phone."
      />
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium">Service</label>
          <select
            value={form.service}
            onChange={(e) => setForm((f) => ({ ...f, service: e.target.value }))}
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          >
            <option value="">Select a service…</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.duration_minutes} min · ${s.price})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Start time</label>
          <input
            type="datetime-local"
            value={form.start_at}
            min={nowDatetimeLocal()}
            onChange={(e) => setForm((f) => ({ ...f, start_at: e.target.value }))}
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium">Guest name</label>
            <input
              value={form.guest_name}
              onChange={(e) => setForm((f) => ({ ...f, guest_name: e.target.value }))}
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Phone</label>
            <input
              value={form.guest_phone}
              onChange={(e) => setForm((f) => ({ ...f, guest_phone: e.target.value }))}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-md bg-brand-600 px-4 py-2 text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Create walk-in"}
        </button>
      </form>
    </div>
  );
}
