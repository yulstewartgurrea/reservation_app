"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { ReservationsPanel } from "../_components/ReservationsPanel";

export default function ReservationsRouteClient() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense fallback={<p className="py-12 text-center text-sm text-slate-500">Loading…</p>}>
      <ReservationsPanel shopId={id} />
    </Suspense>
  );
}
