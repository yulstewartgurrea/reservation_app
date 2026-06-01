"use client";

import { useUrlParams } from "@/lib/useUrlParams";
import { ServicesPanel } from "../_components/ServicesPanel";

export default function ServicesRouteClient() {
  const { id } = useUrlParams<{ id: string }>("/my-shops/[id]/services");
  // First render is "" while the hook reads window.location in useEffect.
  // Render nothing until we have the real id — otherwise ServicesPanel will
  // fire `GET /services/?shop=` and choke on the 500.
  if (!id) return null;
  return <ServicesPanel shopId={id} />;
}
