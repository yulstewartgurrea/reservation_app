"use client";

import { Suspense } from "react";

/**
 * Wraps a client subtree in a Suspense boundary.
 *
 * Required by Next.js 15 around any client component that calls `useSearchParams`,
 * `useParams`, etc. so it doesn't bail out of static generation. Use this once at
 * the page boundary; deeper components don't need their own wrapper.
 */
export function SuspenseClient({
  children,
  fallback = <p className="py-6 text-sm text-slate-500">Loading…</p>,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  return <Suspense fallback={fallback}>{children}</Suspense>;
}
