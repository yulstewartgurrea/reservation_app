"use client";

/**
 * Shop-owner billing page — `/owner/billing`.
 *
 * Commission-invoice emails link here directly (see
 * `create_invoice_payment_link` success/cancel URLs and the lifecycle email
 * templates), so the route path must stay exactly `/owner/billing`.
 *
 * The owner can:
 *  - see every commission invoice across all their shops,
 *  - pay an open invoice online (PayMongo redirect — same pattern as the
 *    reservation online-payment flow),
 *  - in dev-fake mode (no PAYMONGO_SECRET_KEY) simulate the webhook via the
 *    confirm-dev endpoint.
 *
 * Auto-pause: the platform pauses new bookings for a shop once an open invoice
 * stays unpaid past its grace period. The shop serializer doesn't expose the
 * auto-pause flag, so we derive the warning from overdue open invoices — the
 * same signal the backend uses to decide when to pause.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ReceiptText } from "lucide-react";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/errors";
import { formatPhp } from "@/lib/format";
import { SERVICE_FEE_HINT } from "@/lib/billing";
import { Toast, ToastMessage } from "@/components/Toast";

type InvoiceStatus = "open" | "paid" | "void";

type Invoice = {
  id: number;
  shop: number;
  shop_name: string;
  period: string; // "YYYY-MM"
  amount: string;
  status: InvoiceStatus;
  issued_at: string | null;
  due_date: string;
  paid_at: string | null;
  settled_offline: boolean;
  payment_url: string | null;
  is_overdue?: boolean;
};

const STATUS_PILL: Record<string, { class: string; label: string }> = {
  open: { class: "bg-amber-100 text-amber-800", label: "Open" },
  paid: { class: "bg-emerald-100 text-emerald-800", label: "Paid" },
  void: { class: "bg-slate-100 text-slate-600", label: "Void" },
  overdue: { class: "bg-red-100 text-red-800", label: "Overdue" },
};

const STATUS_TABS: { id: "all" | InvoiceStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "paid", label: "Paid" },
  { id: "void", label: "Void" },
];

function isOverdue(inv: Invoice): boolean {
  if (inv.status !== "open") return false;
  if (inv.is_overdue !== undefined) return inv.is_overdue;
  // Fallback: compare due_date (YYYY-MM-DD) to today, local.
  return new Date(inv.due_date + "T23:59:59") < new Date();
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export default function OwnerBillingPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | InvoiceStatus>("all");
  const [busyId, setBusyId] = useState<number | null>(null);
  // Invoice ids the pay endpoint reported as dev-fake (payment_url has the
  // `dev=1` marker the fake PayMongo checkout adds — same signal the
  // reservation checkout produces). Lets us offer a "Simulate payment"
  // button instead of bouncing to a dead fake URL.
  const [devInvoiceIds, setDevInvoiceIds] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get("/shops/commission-invoices/", {
        params: tab === "all" ? undefined : { status: tab },
      });
      const rows: Invoice[] = Array.isArray(data) ? data : data.results ?? [];
      setInvoices(rows);
    } catch (err) {
      setError(formatApiError(err, "Failed to load invoices."));
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  // The auto-pause banner needs the full picture regardless of the active
  // tab, so fetch all invoices once for the banner derivation.
  const [allInvoices, setAllInvoices] = useState<Invoice[]>([]);
  const refreshAll = useCallback(async () => {
    try {
      const { data } = await api.get("/shops/commission-invoices/");
      setAllInvoices(Array.isArray(data) ? data : data.results ?? []);
    } catch {
      // Banner just won't show — the table still surfaces the same info.
    }
  }, []);
  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const overdueInvoices = allInvoices.filter(isOverdue);
  const pausedShopNames = Array.from(
    new Set(overdueInvoices.map((i) => i.shop_name))
  );

  async function payNow(inv: Invoice) {
    setBusyId(inv.id);
    try {
      const { data } = await api.post(
        `/payments/commission-invoices/${inv.id}/pay/`
      );
      const url: string | undefined = data?.payment_url;
      if (url && url.includes("dev=1")) {
        // Dev-fake checkout — the URL is a no-op page. Surface the
        // Simulate-payment button instead of redirecting.
        setDevInvoiceIds((prev) => new Set(prev).add(inv.id));
        setToast({
          variant: "info",
          message: "Dev mode: use “Simulate payment” to complete this invoice.",
        });
        return;
      }
      if (url) {
        window.location.href = url;
        return;
      }
      setToast({ variant: "error", message: "No payment link returned." });
    } catch (err) {
      setToast({
        variant: "error",
        message: formatApiError(err, "Could not start payment."),
      });
    } finally {
      setBusyId(null);
    }
  }

  async function simulatePayment(inv: Invoice) {
    setBusyId(inv.id);
    try {
      await api.post(`/payments/commission-invoices/${inv.id}/confirm-dev/`);
      setToast({ variant: "success", message: "Invoice marked paid (dev)." });
      await Promise.all([load(), refreshAll()]);
    } catch (err) {
      setToast({
        variant: "error",
        message: formatApiError(err, "Dev confirm failed."),
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6 py-4">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Billing</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Monthly commission invoices for all your shops.
        </p>
      </header>

      {overdueInvoices.length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle
              size={20}
              className="mt-0.5 flex-shrink-0 text-red-600"
            />
            <div className="text-sm text-red-800">
              <p className="font-semibold">
                You have {overdueInvoices.length} overdue commission invoice
                {overdueInvoices.length === 1 ? "" : "s"}.
              </p>
              <p className="mt-1">
                Once the grace period passes, new bookings for the affected
                shop{pausedShopNames.length === 1 ? "" : "s"} are{" "}
                <strong>automatically paused</strong> until the invoice is paid.
                {pausedShopNames.length > 0 && (
                  <>
                    {" "}
                    This affects:{" "}
                    <strong>{pausedShopNames.join(", ")}</strong>.
                  </>
                )}
              </p>
              <p className="mt-1">
                Pay the outstanding invoice
                {overdueInvoices.length === 1 ? "" : "s"} below to restore
                bookings immediately.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`min-h-[44px] rounded-full px-4 text-sm font-medium transition sm:min-h-0 sm:py-1.5 ${
              tab === t.id
                ? "bg-brand-600 text-white"
                : "border border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </p>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-20 w-full animate-pulse rounded-xl bg-slate-100"
              aria-hidden
            />
          ))}
        </div>
      ) : invoices.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <ReceiptText
            size={32}
            className="mx-auto text-slate-300"
            strokeWidth={1.5}
          />
          <p className="mt-3 font-medium text-slate-700">
            No invoices yet — you&apos;re all settled.
          </p>
          <p className="mt-1 text-sm text-slate-500">{SERVICE_FEE_HINT}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {invoices.map((inv) => {
            const overdue = isOverdue(inv);
            const pill = overdue
              ? STATUS_PILL.overdue
              : STATUS_PILL[inv.status] ?? STATUS_PILL.void;
            const busy = busyId === inv.id;
            const devMode =
              devInvoiceIds.has(inv.id) ||
              Boolean(inv.payment_url && inv.payment_url.includes("dev=1"));
            return (
              <li
                key={inv.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-semibold text-slate-900">
                        {inv.period}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${pill.class}`}
                      >
                        {pill.label}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-slate-600">
                      {inv.shop_name}
                    </p>
                    <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-500 sm:grid-cols-3">
                      <div>
                        <dt className="text-slate-400">Issued</dt>
                        <dd>{fmtDate(inv.issued_at)}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-400">Due</dt>
                        <dd className={overdue ? "font-medium text-red-700" : ""}>
                          {fmtDate(inv.due_date)}
                        </dd>
                      </div>
                      {inv.status === "paid" && (
                        <div>
                          <dt className="text-slate-400">
                            Paid{inv.settled_offline ? " (offline)" : ""}
                          </dt>
                          <dd>{fmtDate(inv.paid_at)}</dd>
                        </div>
                      )}
                    </dl>
                  </div>

                  <div className="flex flex-col items-stretch gap-2 sm:items-end">
                    <div className="text-right">
                      <div className="text-lg font-semibold text-slate-900">
                        {formatPhp(inv.amount)}
                      </div>
                    </div>
                    {inv.status === "open" && (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <button
                          type="button"
                          onClick={() => payNow(inv)}
                          disabled={busy}
                          className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-brand-600 px-5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 sm:w-auto sm:min-h-0 sm:py-2.5"
                        >
                          {busy ? "Working…" : `Pay ${formatPhp(inv.amount)} now`}
                        </button>
                        {devMode && (
                          <button
                            type="button"
                            onClick={() => simulatePayment(inv)}
                            disabled={busy}
                            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 sm:w-auto sm:min-h-0 sm:py-2.5"
                          >
                            Simulate payment (dev)
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
