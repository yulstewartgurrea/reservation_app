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
import { useParams, useRouter } from "next/navigation";

export default function ShopDashboardRedirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/my-shops/${id}/services`);
  }, [id, router]);

  return null;
}
