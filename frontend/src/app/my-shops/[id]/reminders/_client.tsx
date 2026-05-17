"use client";

import { FormEvent, useEffect, useState } from "react";
import { useUrlParams } from "@/lib/useUrlParams";
import { BellRing, Power, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/errors";

type Reminder = {
  id: number;
  shop: number;
  shop_name: string;
  customer: number;
  customer_display: string;
  service: number | null;
  title: string;
  message: string;
  interval_months: number;
  next_due_at: string;
  last_sent_at: string | null;
  is_active: boolean;
};

type Service = {
  id: number;
  name: string;
};

function defaultDueLocal(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export default function RemindersPage() {
  const { id } = useUrlParams<{ id: string }>("/my-shops/[id]/reminders");
  const shopId = id ? Number(id) : 0;

  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [form, setForm] = useState({
    customer_email: "",
    service: "",
    title: "",
    message: "",
    interval_months: 6,
    next_due_at: defaultDueLocal(6),
  });
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    if (!shopId) return;
    setLoading(true);
    try {
      const [remRes, svcRes] = await Promise.all([
        api.get("/notifications/maintenance-reminders/", { params: { shop: shopId } }),
        api.get("/services/", { params: { shop: shopId } }),
      ]);
      setReminders(remRes.data.results ?? remRes.data);
      setServices((svcRes.data.results ?? svcRes.data) as Service[]);
    } catch (err) {
      setError(formatApiError(err, "Failed to load reminders."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!shopId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      const payload = {
        shop: shopId,
        customer_email: form.customer_email.trim(),
        service: form.service ? Number(form.service) : null,
        title: form.title.trim(),
        message: form.message.trim(),
        interval_months: Number(form.interval_months),
        next_due_at: new Date(form.next_due_at).toISOString(),
        is_active: true,
      };
      await api.post("/notifications/maintenance-reminders/", payload);
      setInfo("Reminder created.");
      setForm({
        customer_email: "",
        service: "",
        title: "",
        message: "",
        interval_months: 6,
        next_due_at: defaultDueLocal(6),
      });
      load();
    } catch (err) {
      setError(formatApiError(err, "Failed to create reminder."));
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(r: Reminder) {
    try {
      await api.patch(`/notifications/maintenance-reminders/${r.id}/`, {
        is_active: !r.is_active,
      });
      load();
    } catch (err) {
      setError(formatApiError(err, "Failed to update."));
    }
  }

  async function remove(r: Reminder) {
    if (!confirm(`Delete reminder "${r.title}" for ${r.customer_display}?`)) return;
    try {
      await api.delete(`/notifications/maintenance-reminders/${r.id}/`);
      load();
    } catch (err) {
      setError(formatApiError(err, "Failed to delete."));
    }
  }

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <div className="mx-auto max-w-3xl py-6">
      <PageHeader
        icon={BellRing}
        title="Maintenance reminders"
        description="Schedule recurring email reminders for your customers — e.g. aircon cleaning every 6 months."
      />

      <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="font-medium">New reminder</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Customer email"
            type="email"
            value={form.customer_email}
            onChange={(v) => update("customer_email", v)}
            required
            hint="Must be a registered Reserva user."
          />
          <Field
            label="Title"
            value={form.title}
            onChange={(v) => update("title", v)}
            required
            hint="e.g. Aircon cleaning"
          />
          <div>
            <label className="block text-sm font-medium text-slate-700">Service (optional)</label>
            <select
              value={form.service}
              onChange={(e) => update("service", e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            >
              <option value="">—</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <Field
            label="Interval (months)"
            type="number"
            value={String(form.interval_months)}
            onChange={(v) => update("interval_months", Math.max(1, Math.min(60, Number(v) || 6)))}
            required
          />
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700">First reminder at</label>
            <input
              type="datetime-local"
              value={form.next_due_at}
              onChange={(e) => update("next_due_at", e.target.value)}
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700">Message (optional)</label>
            <textarea
              value={form.message}
              onChange={(e) => update("message", e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              placeholder="A custom note to include in the email."
            />
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {info && <p className="text-sm text-emerald-600">{info}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-brand-600 px-4 py-2 text-white hover:bg-brand-700 disabled:opacity-50 sm:w-auto"
        >
          {submitting ? "Saving…" : "Create reminder"}
        </button>
      </form>

      <div className="mt-8 space-y-3">
        <h2 className="font-medium">Active reminders</h2>
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : reminders.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
            No reminders yet. Create one above to remind a customer to come back.
          </div>
        ) : (
          <ul className="space-y-2">
            {reminders.map((r) => (
              <li
                key={r.id}
                className={`rounded-lg border p-4 ${
                  r.is_active ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50 opacity-70"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{r.title}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          r.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {r.is_active ? "Active" : "Paused"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{r.customer_display}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Every {r.interval_months} month{r.interval_months > 1 ? "s" : ""} · next:{" "}
                      {new Date(r.next_due_at).toLocaleString()}
                      {r.last_sent_at && ` · last sent ${new Date(r.last_sent_at).toLocaleDateString()}`}
                    </p>
                    {r.message && <p className="mt-2 text-sm text-slate-700">{r.message}</p>}
                  </div>
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => toggleActive(r)}
                      title={r.is_active ? "Pause" : "Resume"}
                      className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    >
                      <Power className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => remove(r)}
                      title="Delete"
                      className="rounded-md p-2 text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-brand-500 focus:ring-brand-500"
      />
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
