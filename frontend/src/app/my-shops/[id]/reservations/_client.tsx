"use client";

import { Suspense } from "react";
import { useUrlParams } from "@/lib/useUrlParams";
import { ReservationsPanel } from "../_components/ReservationsPanel";

export default function ReservationsRouteClient() {
  const { id } = useUrlParams<{ id: string }>("/my-shops/[id]/reservations");
  if (!id) return null;
  return (
    <Suspense fallback={<p className="py-12 text-center text-sm text-slate-500">Loading…</p>}>
      <ReservationsPanel shopId={id} />
    </Suspense>
  );
}
