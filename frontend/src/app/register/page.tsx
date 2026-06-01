"use client";

import { FormEvent, ReactNode, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, Eye, EyeOff, Lock, Mail, Phone, Store, User } from "lucide-react";
import { CircleCheck } from "lucide-react";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/errors";

const COUNTRY_CODES = [
  { code: "PH", dial: "+63", flag: "🇵🇭" },
  { code: "US", dial: "+1", flag: "🇺🇸" },
  { code: "GB", dial: "+44", flag: "🇬🇧" },
  { code: "AU", dial: "+61", flag: "🇦🇺" },
  { code: "SG", dial: "+65", flag: "🇸🇬" },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PASSWORD_RULES = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "One uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "One lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { label: "One number", test: (p: string) => /[0-9]/.test(p) },
  { label: "One special character", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    email: "",
    confirmEmail: "",
    first_name: "",
    last_name: "",
    dial: "+63",
    phone: "",
    password: "",
    confirmPassword: "",
    role: "customer" as "customer" | "shop_owner",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const emailValid = EMAIL_RE.test(form.email);
  const emailsMatch = form.email.length > 0 && form.email === form.confirmEmail;
  const passwordValid = PASSWORD_RULES.every((r) => r.test(form.password));
  const passwordsMatch = form.password.length > 0 && form.password === form.confirmPassword;

  const formValid = useMemo(
    () =>
      emailValid &&
      emailsMatch &&
      form.first_name.trim().length > 0 &&
      form.last_name.trim().length > 0 &&
      form.phone.trim().length > 0 &&
      passwordValid &&
      passwordsMatch,
    [emailValid, emailsMatch, form.first_name, form.last_name, form.phone, passwordValid, passwordsMatch],
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!formValid) {
      setError("Please complete all fields correctly before continuing.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.post("/auth/register/", {
        email: form.email,
        confirm_email: form.confirmEmail,
        password: form.password,
        confirm_password: form.confirmPassword,
        role: form.role,
        first_name: form.first_name,
        last_name: form.last_name,
        phone: `${form.dial}${form.phone.replace(/\s+/g, "")}`,
      });
      router.push(`/verify-otp?email=${encodeURIComponent(form.email)}`);
    } catch (err) {
      setError(formatApiError(err, "Failed to register."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <User className="h-6 w-6" />
          </div>
          <h1 className="mt-3 text-2xl font-bold text-slate-900">Create account</h1>
          <p className="mt-1 text-sm text-slate-500">
            Join BookMe to book services or manage your shop.
          </p>
        </div>

        <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
          <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
            <Field
              label="Email address"
              required
              icon={<Mail className="h-4 w-4" />}
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={(v) => update("email", v)}
              hint="Please enter a valid email address."
              error={form.email.length > 0 && !emailValid ? "Enter a valid email address." : undefined}
            />
            <Field
              label="Confirm email"
              required
              icon={<Mail className="h-4 w-4" />}
              type="email"
              placeholder="re-enter your email"
              value={form.confirmEmail}
              onChange={(v) => update("confirmEmail", v)}
              hint="Email addresses must match."
              error={
                form.confirmEmail.length > 0 && !emailsMatch ? "Email addresses do not match." : undefined
              }
            />
            <Field
              label="First name"
              required
              icon={<User className="h-4 w-4" />}
              placeholder="Enter your first name"
              value={form.first_name}
              onChange={(v) => update("first_name", v)}
            />
            <Field
              label="Last name"
              required
              icon={<User className="h-4 w-4" />}
              placeholder="Enter your last name"
              value={form.last_name}
              onChange={(v) => update("last_name", v)}
            />

            <div className="sm:col-span-2">
              <Label required>Phone number</Label>
              <div className="mt-1 flex rounded-md border border-slate-300 focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500">
                <span className="flex items-center pl-3 text-slate-400">
                  <Phone className="h-4 w-4" />
                </span>
                <div className="relative flex items-center border-r border-slate-200">
                  <select
                    value={form.dial}
                    onChange={(e) => update("dial", e.target.value)}
                    className="appearance-none bg-transparent py-2 pl-2 pr-7 text-sm text-slate-700 focus:outline-none"
                    aria-label="Country code"
                  >
                    {COUNTRY_CODES.map((c) => (
                      <option key={c.code} value={c.dial}>
                        {c.flag} {c.dial}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 h-4 w-4 text-slate-400" />
                </div>
                <input
                  type="tel"
                  inputMode="tel"
                  placeholder="9XX XXX XXXX"
                  value={form.phone}
                  onChange={(e) => update("phone", e.target.value)}
                  required
                  className="w-full bg-transparent px-3 py-2 text-sm focus:outline-none"
                />
              </div>
            </div>

            <Field
              label="Password"
              required
              icon={<Lock className="h-4 w-4" />}
              type={showPassword ? "text" : "password"}
              placeholder="Create a password"
              value={form.password}
              onChange={(v) => update("password", v)}
              hint="Must be at least 8 characters and include uppercase, lowercase, number, and symbol."
              adornment={
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
            />
            <Field
              label="Confirm password"
              required
              icon={<Lock className="h-4 w-4" />}
              type={showConfirmPassword ? "text" : "password"}
              placeholder="Confirm your password"
              value={form.confirmPassword}
              onChange={(v) => update("confirmPassword", v)}
              hint="Passwords must match."
              error={
                form.confirmPassword.length > 0 && !passwordsMatch ? "Passwords do not match." : undefined
              }
              adornment={
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((s) => !s)}
                  className="text-slate-400 hover:text-slate-600"
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
            />
          </div>

          <div className="rounded-lg bg-slate-50 p-4">
            <ul className="space-y-2">
              {PASSWORD_RULES.map((rule) => {
                const ok = rule.test(form.password);
                return (
                  <li
                    key={rule.label}
                    className={`flex items-center gap-2 text-sm ${
                      ok ? "text-emerald-600" : "text-slate-500"
                    }`}
                  >
                    <CircleCheck
                      className={`h-4 w-4 ${ok ? "text-emerald-500" : "text-slate-300"}`}
                    />
                    {rule.label}
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <Label required>I am a…</Label>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <RoleCard
                selected={form.role === "customer"}
                onSelect={() => update("role", "customer")}
                icon={<User className="h-5 w-5" />}
                title="Customer"
                description="Book and manage services"
              />
              <RoleCard
                selected={form.role === "shop_owner"}
                onSelect={() => update("role", "shop_owner")}
                icon={<Store className="h-5 w-5" />}
                title="Shop owner"
                description="Manage my shop and services"
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-brand-600 px-4 py-3 font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {loading ? "Creating…" : "Create account"}
          </button>

          <p className="border-t border-slate-100 pt-4 text-center text-sm text-slate-500">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-brand-600 hover:underline">
              Log in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

function Label({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {children}
      {required && <span className="text-red-500"> *</span>}
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  placeholder,
  icon,
  adornment,
  hint,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  icon?: ReactNode;
  adornment?: ReactNode;
  hint?: string;
  error?: string;
}) {
  return (
    <div>
      <Label required={required}>{label}</Label>
      <div
        className={`mt-1 flex items-center rounded-md border bg-white focus-within:ring-1 ${
          error
            ? "border-red-400 focus-within:border-red-500 focus-within:ring-red-500"
            : "border-slate-300 focus-within:border-brand-500 focus-within:ring-brand-500"
        }`}
      >
        {icon && <span className="pl-3 text-slate-400">{icon}</span>}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          placeholder={placeholder}
          className="w-full bg-transparent px-3 py-2 text-sm focus:outline-none"
        />
        {adornment && <span className="pr-3">{adornment}</span>}
      </div>
      {error ? (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      ) : (
        hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>
      )}
    </div>
  );
}

function RoleCard({
  selected,
  onSelect,
  icon,
  title,
  description,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex items-center gap-3 rounded-lg border p-4 text-left transition ${
        selected ? "border-brand-600 bg-brand-50" : "border-slate-300 bg-white hover:border-slate-400"
      }`}
    >
      <span
        className={`flex h-4 w-4 flex-none items-center justify-center rounded-full border ${
          selected ? "border-brand-600" : "border-slate-300"
        }`}
      >
        {selected && <span className="h-2 w-2 rounded-full bg-brand-600" />}
      </span>
      <span
        className={`flex h-9 w-9 flex-none items-center justify-center rounded-full ${
          selected ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500"
        }`}
      >
        {icon}
      </span>
      <span>
        <span className="block text-sm font-medium text-slate-900">{title}</span>
        <span className="block text-xs text-slate-500">{description}</span>
      </span>
    </button>
  );
}
