"use client";

/**
 * Shared layout for the shop dashboard.
 *
 * Renders the sidebar once and a `{children}` slot for the active section.
 * Because layouts persist across navigation in Next.js App Router, clicking a
 * sidebar item only swaps the content area — the sidebar stays mounted, so
 * the UX feels like a tabbed dashboard while each section keeps its own URL.
 *
 * Responsibilities owned here:
 * - Fetch the shop summary (used by the sidebar shop card + pause/publish).
 * - Fetch the pending-reservation count (used by the sidebar badge — needs to
 *   be visible from every section, not just the Reservations route).
 * - Pause/Publish the shop. The action updates local state immediately so the
 *   sidebar pill and button label stay in sync.
 *
 * Each subpage owns its own toasts and confirmation dialogs (e.g. the Services
 * page owns the "Delete this service?" dialog) so there's no global dialog
 * mutex to coordinate.
 */

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/errors";
import { Toast, ToastMessage } from "@/components/Toast";
import { Sidebar } from "./_components/Sidebar";

type ShopSummary = {
  id: number;
  name: string;
  status: "active" | "paused" | "pending";
  cover_photo?: string | null;
};

export default function ShopDashboardLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const [shop, setShop] = useState<ShopSummary | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const fetchPendingCount = useCallback(async () => {
    try {
      // Pull just enough rows to count pending ones — the dashboard typically
      // has few open bookings, so we can afford to count client-side. Promote
      // to a dedicated `/reservations/pending-count/` endpoint if shops start
      // accumulating hundreds of rows.
      const res = await api.get("/reservations/", {
        params: { shop: id, status: "pending" },
      });
      const rows = res.data.results ?? res.data;
      setPendingCount(rows.length);
    } catch {
      // Silently ignore — the badge just won't appear.
    }
  }, [id]);

  useEffect(() => {
    api
      .get(`/shops/${id}/`)
      .then((r) => setShop(r.data))
      .catch((err) =>
        setToast({ variant: "error", message: formatApiError(err, "Failed to load shop.") })
      );
    fetchPendingCount();
  }, [id, fetchPendingCount]);

  async function togglePublish() {
    if (!shop) return;
    const endpoint = shop.status === "active" ? "pause" : "publish";
    try {
      const res = await api.post(`/shops/${id}/${endpoint}/`);
      setShop(res.data);
    } catch (err) {
      setToast({ variant: "error", message: formatApiError(err) });
    }
  }

  return (
    <div className="grid gap-6 py-4 lg:grid-cols-[240px_1fr]">
      <Sidebar
        shopId={id}
        shop={shop}
        pendingCount={pendingCount}
        onTogglePublish={togglePublish}
      />
      <div className="min-w-0">{children}</div>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
