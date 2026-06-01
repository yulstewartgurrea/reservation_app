"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUrlParams } from "@/lib/useUrlParams";
import { CalendarDays, Info, User, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/errors";
import { formatPhp, nowDatetimeLocal } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";

type Service = {
  id: number;
  name: string;
  duration_minutes: number;
  price: string;
  max_quantity: number;
  unit_label: string;
};

type Resource = { id: number; name: string; is_active: boolean };

type FormState = {
  service: string;
  start_at: string;
  quantity: number;
  resource: string; // "" = auto-assign any free station
  guest_name: string;
  guest_phone: string;
};

const INITIAL_FORM: FormState = {
  service: "",
  start_at: "",
  quantity: 1,
  resource: "",
  guest_name: "",
  guest_phone: "",
};

/** Naive pluralization: "unit" → "units" when qty != 1. */
function unitText(qty: number, unitLabel: string): string {
  const label = unitLabel?.trim() || "unit";
  return `${qty} ${qty === 1 ? label : `${label}s`}`;
}

/** Strips a "+63" or leading "0" so the visible input is always the 10-digit
 * subscriber number. Submit always re-prefixes with +63. */
function normalizePhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("63")) return digits.slice(2).slice(0, 10);
  if (digits.startsWith("0")) return digits.slice(1).slice(0, 10);
  return digits.slice(0, 10);
}

function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits ? `+63${digits}` : "";
}

export default function WalkInPage() {
  const { id } = useUrlParams<{ id: string }>("/my-shops/[id]/walk-in");
  const router = useRouter();
  const [services, setServices] = useState<Service[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    api
      .get(`/services/`, { params: { shop: id } })
      .then((r) => setServices(r.data.results ?? r.data))
      .catch(() => setServices([]));
    api
      .get(`/shops/resources/`, { params: { shop: id } })
      .then((r) => {
        const list: Resource[] = r.data.results ?? r.data;
        setResources(list.filter((x) => x.is_active));
      })
      .catch(() => setResources([]));
  }, [id]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const selectedService = services.find(
    (s) => String(s.id) === form.service
  );
  const maxQuantity = selectedService?.max_quantity ?? 1;
  const showQuantity = maxQuantity > 1;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post("/reservations/walk-in/", {
        shop: Number(id),
        service: Number(form.service),
        start_at: new Date(form.start_at).toISOString(),
        quantity: form.quantity,
        ...(form.resource ? { resource: Number(form.resource) } : {}),
        guest_name: form.guest_name.trim(),
        guest_phone: toE164(form.guest_phone),
      });
      router.push(`/my-shops/${id}`);
    } catch (err) {
      setError(formatApiError(err, "Failed to create walk-in."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl py-6">
      <PageHeader
        onBack={() => router.back()}
        backLabel="Back"
        icon={UserPlus}
        title="Add walk-in"
        description="Manually create a booking for an in-person customer. No account required — just enter their name and phone."
      />

      <form onSubmit={onSubmit} className="mt-6 space-y-5">
        <FormCard icon={CalendarDays} title="Booking details">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Service"
              required
              helper="Choose the service the customer wants to book."
            >
              <select
                value={form.service}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    service: e.target.value,
                    quantity: 1,
                  }))
                }
                required
                className={inputClasses}
              >
                <option value="">Select a service…</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.duration_minutes} min · {formatPhp(s.price)})
                  </option>
                ))}
              </select>
            </Field>
            {showQuantity && (
              <Field
                label={`Quantity (${selectedService?.unit_label?.trim() || "unit"}s)`}
                helper={`Up to ${unitText(
                  maxQuantity,
                  selectedService?.unit_label ?? "unit"
                )}. Time and price scale with the quantity.`}
              >
                <div className="inline-flex items-stretch overflow-hidden rounded-md border border-slate-300">
                  <button
                    type="button"
                    aria-label="Decrease quantity"
                    onClick={() =>
                      updateField("quantity", Math.max(1, form.quantity - 1))
                    }
                    disabled={form.quantity <= 1}
                    className="flex h-11 w-11 items-center justify-center text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    –
                  </button>
                  <span className="flex h-11 min-w-[3rem] items-center justify-center border-x border-slate-300 px-3 text-base font-semibold text-slate-900">
                    {form.quantity}
                  </span>
                  <button
                    type="button"
                    aria-label="Increase quantity"
                    onClick={() =>
                      updateField(
                        "quantity",
                        Math.min(maxQuantity, form.quantity + 1)
                      )
                    }
                    disabled={form.quantity >= maxQuantity}
                    className="flex h-11 w-11 items-center justify-center text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
              </Field>
            )}
            <Field
              label="Start date & time"
              required
              helper="Pick the date and time for the booking."
            >
              <input
                type="datetime-local"
                value={form.start_at}
                min={nowDatetimeLocal()}
                onChange={(e) => updateField("start_at", e.target.value)}
                required
                className={inputClasses}
              />
            </Field>
            {resources.length > 0 && (
              <Field
                label="Station"
                helper="Leave on auto-assign to use any free station, or pin this booking to a specific one."
              >
                <select
                  value={form.resource}
                  onChange={(e) => updateField("resource", e.target.value)}
                  className={inputClasses}
                >
                  <option value="">Auto-assign (any free)</option>
                  {resources.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
        </FormCard>

        <FormCard icon={User} title="Customer information">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Guest name"
              required
              helper="Full name of the customer."
            >
              <input
                value={form.guest_name}
                onChange={(e) => updateField("guest_name", e.target.value)}
                placeholder="Enter customer name"
                required
                className={inputClasses}
              />
            </Field>
            <Field
              label="Phone number"
              helper="We'll use this to contact the customer."
            >
              <PhonePhInput
                value={form.guest_phone}
                onChange={(v) => updateField("guest_phone", normalizePhoneInput(v))}
              />
            </Field>
          </div>

          <InfoBanner
            title="Walk-in booking"
            body='This booking will be created as "Confirmed" by default. You can update the status later if needed.'
          />
        </FormCard>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          >
            {error}
          </p>
        )}

        <FormFooter
          onCancel={() => router.push(`/my-shops/${id}`)}
          saving={saving}
        />
      </form>
    </div>
  );
}

const inputClasses =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

function FormCard({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <header className="mb-5 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <Icon size={18} />
        </span>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      </header>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  helper,
  children,
}: {
  label: string;
  required?: boolean;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
      {helper && <p className="mt-1.5 text-xs text-slate-500">{helper}</p>}
    </div>
  );
}

function PhonePhInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-stretch rounded-md border border-slate-300 bg-white focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500">
      <span
        aria-hidden="true"
        className="flex items-center gap-1.5 border-r border-slate-200 px-3 text-sm text-slate-700"
      >
        <span className="text-base leading-none">🇵🇭</span>
        <span className="font-medium">+63</span>
      </span>
      <input
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="9XX XXX XXXX"
        aria-label="Phone number (Philippines)"
        className="w-full rounded-r-md bg-transparent px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
      />
    </div>
  );
}

function InfoBanner({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
      <Info size={16} className="mt-0.5 flex-shrink-0 text-brand-600" />
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5 text-brand-700">{body}</p>
      </div>
    </div>
  );
}

function FormFooter({
  onCancel,
  saving,
}: {
  onCancel: () => void;
  saving: boolean;
}) {
  return (
    <div className="flex flex-col-reverse gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:justify-between sm:p-5">
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={saving}
        className="inline-flex items-center justify-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <CalendarDays size={16} />
        {saving ? "Creating…" : "Create walk-in"}
      </button>
    </div>
  );
}
