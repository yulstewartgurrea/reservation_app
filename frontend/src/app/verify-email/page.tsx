"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/errors";

function VerifyEmailInner() {
  const params = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<"verifying" | "ok" | "fail">("verifying");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState("fail");
      setError("Missing token.");
      return;
    }
    api
      .post("/auth/verify-email/", { token })
      .then(() => setState("ok"))
      .catch((err) => {
        setError(formatApiError(err, "Verification failed."));
        setState("fail");
      });
  }, [token]);

  return (
    <div className="mx-auto max-w-md py-12 text-center">
      {state === "verifying" && <p className="text-sm text-slate-500">Verifying…</p>}
      {state === "ok" && (
        <>
          <h1 className="text-2xl font-semibold text-emerald-700">Email verified ✓</h1>
          <p className="mt-2 text-sm text-slate-600">You&apos;re all set.</p>
        </>
      )}
      {state === "fail" && (
        <>
          <h1 className="text-2xl font-semibold text-red-700">Verification failed</h1>
          <p className="mt-2 text-sm text-slate-600">{error}</p>
        </>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<p className="py-12 text-center text-sm text-slate-500">Verifying…</p>}>
      <VerifyEmailInner />
    </Suspense>
  );
}
