"use client";

import { useParams } from "next/navigation";
import { ReservationsPanel } from "../_components/ReservationsPanel";

export default function ReservationsRouteClient() {
  const { id } = useParams<{ id: string }>();
  return <ReservationsPanel shopId={id} />;
}
