"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/errors";
import { formatPhp } from "@/lib/format";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { Toast, ToastMessage } from "@/components/Toast";

type Row = {
  id: number;
  shop_id: number;
  shop_name: string;
  amount: number;
  rate: number;
  period: string;
  settled: boolean;
  created_at: string;
};

type Summary = {
  shop_id: number;
  shop_name: string;
  total: number;
  settled: number;
  outstanding: number;
};

type InvoiceStatus = "open" | "paid" | "void";

type Invoice = {
  id: number;
  shop: number;
  shop_name: string;
  period: string;
  amount: string;
  status: InvoiceStatus;
  issued_at: string | null;
  due_date: string;
  paid_at: string | null;
  settled_offline: boolean;
  is_overdue?: boolean;
};

const INVOICE_PILL: Record<string, { class: string; label: string }> = {
  open: { class: "bg-amber-100 text-amber-800", label: "Open" },
  paid: { class: "bg-emerald-100 text-emerald-800", label: "Paid" },
  void: { class: "bg-slate-100 text-slate-600", label: "Void" },
  overdue: { class: "bg-red-100 text-red-800", label: "Overdue" },
};

type ViewTab = "ledger" | "invoices";

type PendingAction =
  | { kind: "generate" }
  | { kind: "settle"; invoice: Invoice }
  | { kind: "void"; invoice: Invoice };

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function invoiceOverdue(inv: Invoice): boolean {
  if (inv.status !== "open") return false;
  if (inv.is_overdue !== undefined) return inv.is_overdue;
  return new Date(inv.due_date + "T23:59:59") < new Date();
}

export default function CommissionPage() {
  const [view, setView] = useState<ViewTab>("ledger");

  // --- Ledger (existing) ------------------------------------------------ //
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary[]>([]);
  const [period, setPeriod] = useState("");
  const [loading, setLoading] = useState(true);

  const loadLedger = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin-panel/commission/", {
        params: period ? { period } : undefined,
      });
      setRows(data.rows);
      setSummary(data.by_shop);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  // --- Invoices --------------------------------------------------------- //
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invOutstanding, setInvOutstanding] = useState(0);
  const [invLoading, setInvLoading] = useState(true);
  const [invError, setInvError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"" | InvoiceStatus>("");
  const [periodFilter, setPeriodFilter] = useState("");
  const [genPeriod, setGenPeriod] = useState("");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const loadInvoices = useCallback(async () => {
    setInvLoading(true);
    setInvError(null);
    try {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      if (periodFilter) params.period = periodFilter;
      const { data } = await api.get("/admin-panel/commission/invoices/", {
        params: Object.keys(params).length ? params : undefined,
      });
      setInvoices(data.rows ?? data.results ?? data);
      setInvOutstanding(Number(data.outstanding ?? 0));
    } catch (err) {
      setInvError(formatApiError(err, "Failed to load invoices."));
      setInvoices([]);
    } finally {
      setInvLoading(false);
    }
  }, [statusFilter, periodFilter]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  async function runAction(action: PendingAction) {
    try {
      if (action.kind === "generate") {
        const { data } = await api.post(
          "/admin-panel/commission/invoices/generate/",
          genPeriod ? { period: genPeriod } : {}
        );
        setToast({
          variant: "success",
          message: `${data.generated ?? 0} invoice(s) generated / refreshed.`,
        });
      } else if (action.kind === "settle") {
        await api.post(
          `/admin-panel/commission/invoices/${action.invoice.id}/settle/`
        );
        setToast({ variant: "success", message: "Invoice marked settled." });
      } else {
        await api.post(
          `/admin-panel/commission/invoices/${action.invoice.id}/void/`
        );
        setToast({ variant: "success", message: "Invoice voided." });
      }
      setPending(null);
      // Both the invoice list and the summary ledger can change.
      await Promise.all([loadInvoices(), loadLedger()]);
    } catch (err) {
      setToast({
        variant: "error",
        message: formatApiError(err, "Action failed."),
      });
    }
  }

  return (
    <div className="space-y-6 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Commission</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setView("ledger")}
            className={`rounded-md px-3 py-2 text-sm font-medium ${
              view === "ledger"
                ? "bg-brand-600 text-white"
                : "border border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            Ledger
          </button>
          <button
            type="button"
            onClick={() => setView("invoices")}
            className={`rounded-md px-3 py-2 text-sm font-medium ${
              view === "invoices"
                ? "bg-brand-600 text-white"
                : "border border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            Invoices
          </button>
        </div>
      </div>

      {view === "ledger" ? (
        <>
          <div className="flex items-center justify-end gap-2">
            <label className="text-sm text-slate-600">Period</label>
            <input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
            {period && (
              <button
                onClick={() => setPeriod("")}
                className="text-xs text-slate-500 hover:underline"
              >
                clear
              </button>
            )}
          </div>

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              By shop
            </h2>
            {loading ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : summary.length === 0 ? (
              <p className="text-sm text-slate-500">Nothing yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Shop</th>
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2 text-right">Settled</th>
                      <th className="px-3 py-2 text-right">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.map((r) => (
                      <tr key={r.shop_id} className="border-t border-slate-100">
                        <td className="px-3 py-2">{r.shop_name}</td>
                        <td className="px-3 py-2 text-right">
                          {formatPhp(r.total)}
                        </td>
                        <td className="px-3 py-2 text-right text-emerald-700">
                          {formatPhp(r.settled)}
                        </td>
                        <td className="px-3 py-2 text-right text-amber-700">
                          {formatPhp(r.outstanding)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Recent entries
            </h2>
            <ul className="space-y-2">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between rounded-md border border-slate-200 bg-white p-3 text-sm"
                >
                  <div>
                    <div className="font-medium">{r.shop_name}</div>
                    <div className="text-xs text-slate-500">
                      {r.period} · rate {(r.rate * 100).toFixed(1)}% ·{" "}
                      {new Date(r.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{formatPhp(r.amount)}</div>
                    <div
                      className={`text-xs ${
                        r.settled ? "text-emerald-700" : "text-amber-700"
                      }`}
                    >
                      {r.settled ? "settled" : "outstanding"}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500">
                  Status
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as "" | InvoiceStatus)
                  }
                  className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                >
                  <option value="">All</option>
                  <option value="open">Open</option>
                  <option value="paid">Paid</option>
                  <option value="void">Void</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">
                  Period
                </label>
                <input
                  type="month"
                  value={periodFilter}
                  onChange={(e) => setPeriodFilter(e.target.value)}
                  className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
              </div>
              {(statusFilter || periodFilter) && (
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter("");
                    setPeriodFilter("");
                  }}
                  className="pb-1.5 text-xs text-slate-500 hover:underline"
                >
                  clear
                </button>
              )}
            </div>

            <div className="flex items-end gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-500">
                  Generate for
                </label>
                <input
                  type="month"
                  value={genPeriod}
                  onChange={(e) => setGenPeriod(e.target.value)}
                  className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  placeholder="prev month"
                />
              </div>
              <button
                type="button"
                onClick={() => setPending({ kind: "generate" })}
                className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                Generate invoices
              </button>
            </div>
          </div>

          {invError && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              {invError}
            </p>
          )}

          {invLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : invoices.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
              <p className="text-slate-700">No invoices match these filters.</p>
              <p className="mt-1 text-sm text-slate-500">
                Use “Generate invoices” to create them for a closed month.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                Outstanding (open invoices):{" "}
                <span className="font-semibold text-amber-700">
                  {formatPhp(invOutstanding)}
                </span>
              </p>
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Shop</th>
                      <th className="px-3 py-2">Period</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Issued</th>
                      <th className="px-3 py-2">Due</th>
                      <th className="px-3 py-2">Paid</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => {
                      const overdue = invoiceOverdue(inv);
                      const pill = overdue
                        ? INVOICE_PILL.overdue
                        : INVOICE_PILL[inv.status] ?? INVOICE_PILL.void;
                      return (
                        <tr
                          key={inv.id}
                          className="border-t border-slate-100 align-middle"
                        >
                          <td className="px-3 py-2">{inv.shop_name}</td>
                          <td className="px-3 py-2">{inv.period}</td>
                          <td className="px-3 py-2 text-right font-medium">
                            {formatPhp(inv.amount)}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${pill.class}`}
                            >
                              {pill.label}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {fmtDate(inv.issued_at)}
                          </td>
                          <td
                            className={`px-3 py-2 ${
                              overdue
                                ? "font-medium text-red-700"
                                : "text-slate-600"
                            }`}
                          >
                            {fmtDate(inv.due_date)}
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {fmtDate(inv.paid_at)}
                            {inv.status === "paid" && inv.settled_offline
                              ? " (offline)"
                              : ""}
                          </td>
                          <td className="px-3 py-2">
                            {inv.status === "open" ? (
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPending({ kind: "settle", invoice: inv })
                                  }
                                  className="rounded-md border border-emerald-300 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                                >
                                  Mark settled
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPending({ kind: "void", invoice: inv })
                                  }
                                  className="rounded-md border border-red-300 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                                >
                                  Void
                                </button>
                              </div>
                            ) : (
                              <span className="block text-right text-xs text-slate-400">
                                —
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      <ConfirmationDialog
        open={pending?.kind === "generate"}
        title="Generate commission invoices"
        description={
          genPeriod
            ? `Generate / refresh invoices for ${genPeriod}. Existing invoices for that month are updated, not duplicated.`
            : "Generate / refresh invoices for the previous calendar month. Existing invoices are updated, not duplicated."
        }
        confirmLabel="Generate"
        onConfirm={() => runAction({ kind: "generate" })}
        onCancel={() => setPending(null)}
      />

      <ConfirmationDialog
        open={pending?.kind === "settle"}
        title="Mark invoice settled (offline)"
        variant="warning"
        description="Confirm this invoice was paid offline (bank / GCash). This marks it paid and clears any related auto-pause."
        confirmLabel="Mark settled"
        context={
          pending?.kind === "settle"
            ? [
                { label: "Shop", value: pending.invoice.shop_name },
                { label: "Period", value: pending.invoice.period },
                { label: "Amount", value: formatPhp(pending.invoice.amount) },
              ]
            : undefined
        }
        onConfirm={() => {
          if (pending?.kind === "settle") return runAction(pending);
        }}
        onCancel={() => setPending(null)}
      />

      <ConfirmationDialog
        open={pending?.kind === "void"}
        title="Void invoice"
        variant="danger"
        description="Voiding cancels this invoice. The owner will no longer be billed for it and any related auto-pause is cleared. This cannot be undone."
        confirmLabel="Void invoice"
        context={
          pending?.kind === "void"
            ? [
                { label: "Shop", value: pending.invoice.shop_name },
                { label: "Period", value: pending.invoice.period },
                { label: "Amount", value: formatPhp(pending.invoice.amount) },
              ]
            : undefined
        }
        onConfirm={() => {
          if (pending?.kind === "void") return runAction(pending);
        }}
        onCancel={() => setPending(null)}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
