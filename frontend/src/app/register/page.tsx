"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/errors";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    email: "",
    username: "",
    password: "",
    role: "customer" as "customer" | "shop_owner",
    first_name: "",
    last_name: "",
    phone: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post("/auth/register/", form);
      router.push(`/verify-otp?email=${encodeURIComponent(form.email)}`);
    } catch (err) {
      setError(formatApiError(err, "Failed to register."));
    } finally {
      setLoading(false);
    }
  }

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <div className="mx-auto max-w-md py-10">
      <h1 className="text-2xl font-semibold">Create account</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Email" type="email" value={form.email} onChange={(v) => update("email", v)} required />
          <Field label="Username" value={form.username} onChange={(v) => update("username", v)} required />
          <Field label="First name" value={form.first_name} onChange={(v) => update("first_name", v)} />
          <Field label="Last name" value={form.last_name} onChange={(v) => update("last_name", v)} />
          <Field label="Phone" value={form.phone} onChange={(v) => update("phone", v)} />
          <Field
            label="Password"
            type="password"
            value={form.password}
            onChange={(v) => update("password", v)}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">I am a…</label>
          <div className="mt-2 flex gap-3">
            {(["customer", "shop_owner"] as const).map((r) => (
              <label
                key={r}
                className={`flex flex-1 cursor-pointer items-center justify-center rounded-md border px-3 py-2 text-sm ${
                  form.role === r
                    ? "border-brand-600 bg-brand-50 text-brand-700"
                    : "border-slate-300 bg-white text-slate-700"
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  className="sr-only"
                  checked={form.role === r}
                  onChange={() => update("role", r)}
                />
                {r === "customer" ? "Customer" : "Shop owner"}
              </label>
            ))}
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-brand-600 px-4 py-2 text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {loading ? "Creating…" : "Create account"}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
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
    </div>
  );
}
