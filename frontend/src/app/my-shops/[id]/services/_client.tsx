"use client";

import { useParams } from "next/navigation";
import { ServicesPanel } from "../_components/ServicesPanel";

export default function ServicesRouteClient() {
  const { id } = useParams<{ id: string }>();
  return <ServicesPanel shopId={id} />;
}
