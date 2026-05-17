"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { SlotPicker } from "@/components/SlotPicker";
import { formatApiError } from "@/lib/errors";
import { useUrlParams } from "@/lib/useUrlParams";

type Reservation = {
  id: number;
  shop: number;
  service: number;
  staff: number | null;
  shop_name: string;
  service_name: string;
  start_at: string;
};

export default function ReschedulePage() {
  const { id } = useUrlParams<{ id: string }>("/reservations/[id]/reschedule");
  const router = useRouter();
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.get(`/reservations/${id}/`).then((r) => setReservation(r.data));
  }, [id]);

  async function submit() {
    if (!chosen) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/reservations/${id}/reschedule/`, { start_at: chosen });
      router.push("/reservations");
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!reservation) return <p className="py-6 text-sm text-slate-500">Loading…</p>;

  return (
    <div className="space-y-5 py-4">
      <div>
        <h1 className="text-2xl font-semibold">Reschedule</h1>
        <p className="text-sm text-slate-600">
          {reservation.shop_name} · {reservation.service_name}
        </p>
        <p className="text-xs text-slate-500">
          Current time: {new Date(reservation.start_at).toLocaleString()}
        </p>
      </div>

      <SlotPicker
        shopId={reservation.shop}
        serviceId={reservation.service}
        staffId={reservation.staff}
        chosen={chosen}
        onChosen={setChosen}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        disabled={!chosen || submitting}
        onClick={submit}
        className="w-full rounded-md bg-brand-600 px-4 py-3 text-white disabled:opacity-50 sm:w-auto"
      >
        {submitting ? "Rescheduling…" : "Confirm new time"}
      </button>
    </div>
  );
}
