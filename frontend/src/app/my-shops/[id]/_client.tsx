"use client";

/**
 * Shop dashboard root.
 *
 * The dashboard is rendered as a set of sibling routes under the shared
 * layout (`/edit`, `/hours`, `/services`, `/reservations`, etc.). Visiting
 * `/my-shops/[id]` directly has no canonical content of its own, so we
 * redirect to the Services view — the most common landing destination.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUrlParams } from "@/lib/useUrlParams";

export default function ShopDashboardRedirect() {
  const { id } = useUrlParams<{ id: string }>("/my-shops/[id]");
  const router = useRouter();

  useEffect(() => {
    if (!id) return;
    router.replace(`/my-shops/${id}/services`);
  }, [id, router]);

  return null;
}
