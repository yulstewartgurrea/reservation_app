"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatApiError } from "@/lib/errors";

const RESEND_COOLDOWN_SECONDS = 60;

function VerifyOtpInner() {
  const router = useRouter();
  const params = useSearchParams();
  const loginWithTokens = useAuth((s) => s.loginWithTokens);

  const [email, setEmail] = useState(params.get("email") ?? "");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      const { data } = await api.post("/auth/verify-otp/", { email, code });
      if (data.access && data.refresh) {
        await loginWithTokens(data.access, data.refresh);
      }
      router.push("/");
    } catch (err) {
      setError(formatApiError(err, "Verification failed."));
    } finally {
      setSubmitting(false);
    }
  }

  async function onResend() {
    setError(null);
    setInfo(null);
    setResending(true);
    try {
      await api.post("/auth/request-otp/", { email });
      setInfo("A new code has been sent. Check your email.");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(formatApiError(err, "Could not resend code."));
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="mx-auto max-w-md py-10">
      <h1 className="text-2xl font-semibold">Verify your email</h1>
      <p className="mt-2 text-sm text-slate-600">
        We sent a 6-digit code to <span className="font-medium">{email || "your email"}</span>.
        Enter it below to finish signing up.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        {!params.get("email") && (
          <div>
            <label className="block text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-brand-500 focus:ring-brand-500"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700">Verification code</label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-3 text-center text-2xl tracking-[0.5em] focus:border-brand-500 focus:ring-brand-500"
            placeholder="------"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {info && <p className="text-sm text-emerald-600">{info}</p>}

        <button
          type="submit"
          disabled={submitting || code.length !== 6}
          className="w-full rounded-md bg-brand-600 px-4 py-3 text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {submitting ? "Verifying…" : "Verify and continue"}
        </button>

        <button
          type="button"
          onClick={onResend}
          disabled={resending || cooldown > 0 || !email}
          className="w-full text-sm text-slate-600 underline disabled:text-slate-400 disabled:no-underline"
        >
          {cooldown > 0
            ? `Resend code in ${cooldown}s`
            : resending
            ? "Sending…"
            : "Resend code"}
        </button>
      </form>
    </div>
  );
}

export default function VerifyOtpPage() {
  return (
    <Suspense fallback={<p className="py-12 text-center text-sm text-slate-500">Loading…</p>}>
      <VerifyOtpInner />
    </Suspense>
  );
}
