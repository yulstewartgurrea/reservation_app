"use client";

/**
 * Stations (Resources) management page.
 *
 * A "Station" is the shop's bookable capacity unit — a carwash bay, a salon
 * chair, a treatment room, a table. The NUMBER of active stations is the shop's
 * parallel capacity: 2 stations => 2 bookings can run at the same time. Staff is
 * a separate, non-binding "who serves the customer" request and is managed on
 * the Staff page. See shops.Resource on the backend.
 *
 * The owner can rename the per-shop label ("Bay" / "Chair" / "Room" / "Slot")
 * so the rest of the UI uses their word, add/rename/retire stations, and see the
 * resulting capacity at a glance.
 */

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useUrlParams } from "@/lib/useUrlParams";
import { CheckCircle2, Grid3x3, Pencil, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/errors";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { Toast, ToastMessage } from "@/components/Toast";

type Resource = {
  id: number;
  shop: number;
  name: string;
  is_active: boolean;
};

export default function ResourcesPage() {
  const { id } = useUrlParams<{ id: string }>("/my-shops/[id]/resources");
  const [resources, setResources] = useState<Resource[]>([]);
  const [label, setLabel] = useState("Station");
  const [labelDraft, setLabelDraft] = useState("Station");
  const [savingLabel, setSavingLabel] = useState(false);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  async function loadShop() {
    if (!id) return;
    try {
      const { data } = await api.get(`/shops/${id}/`);
      setLabel(data.resource_label || "Station");
      setLabelDraft(data.resource_label || "Station");
    } catch {
      // Non-fatal: fall back to the default label.
    }
  }

  async function loadResources() {
    if (!id) return;
    try {
      const { data } = await api.get(`/shops/resources/`, { params: { shop: id } });
      setResources(data.results ?? data);
    } catch (err) {
      setToast({
        variant: "error",
        message: formatApiError(err, "Failed to load stations."),
      });
    }
  }

  useEffect(() => {
    if (!id) return;
    loadShop();
    loadResources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const activeCount = useMemo(
    () => resources.filter((r) => r.is_active).length,
    [resources]
  );

  async function saveLabel(e: FormEvent) {
    e.preventDefault();
    setSavingLabel(true);
    try {
      await api.patch(`/shops/${id}/`, { resource_label: labelDraft.trim() || "Station" });
      setLabel(labelDraft.trim() || "Station");
      setToast({ variant: "success", message: "Label updated." });
    } catch (err) {
      setToast({ variant: "error", message: formatApiError(err, "Failed to save label.") });
    } finally {
      setSavingLabel(false);
    }
  }

  async function addResource(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/shops/resources/`, { shop: Number(id), name: name.trim() });
      setToast({ variant: "success", message: `${label} added.` });
      setName("");
      loadResources();
    } catch (err) {
      setToast({ variant: "error", message: formatApiError(err, "Failed to add.") });
    } finally {
      setSaving(false);
    }
  }

  async function saveRename(rid: number) {
    try {
      await api.patch(`/shops/resources/${rid}/`, { name: editName.trim() });
      setEditingId(null);
      loadResources();
    } catch (err) {
      setToast({ variant: "error", message: formatApiError(err) });
    }
  }

  async function toggleActive(r: Resource) {
    try {
      await api.patch(`/shops/resources/${r.id}/`, { is_active: !r.is_active });
      loadResources();
    } catch (err) {
      setToast({ variant: "error", message: formatApiError(err) });
    }
  }

  async function confirmDelete() {
    if (deletingId == null) return;
    try {
      await api.delete(`/shops/resources/${deletingId}/`);
      setToast({ variant: "success", message: `${label} removed.` });
      setDeletingId(null);
      loadResources();
    } catch (err) {
      setToast({ variant: "error", message: formatApiError(err) });
    }
  }

  const suggestedName = `${label} ${resources.length + 1}`;

  return (
    <div className="mx-auto max-w-3xl py-6">
      <PageHeader
        icon={Grid3x3}
        title="Stations"
        description="Stations are your bookable capacity. The number of active stations is how many bookings you can serve at the same time."
      />

      {/* Capacity callout */}
      <div className="flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
          <CheckCircle2 size={20} />
        </div>
        <p className="text-sm text-slate-700">
          This shop can serve{" "}
          <span className="font-semibold text-slate-900">
            {activeCount} booking{activeCount === 1 ? "" : "s"}
          </span>{" "}
          at the same time ({activeCount} active {activeCount === 1 ? label.toLowerCase() : `${label.toLowerCase()}s`}).
        </p>
      </div>

      {/* Label editor */}
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-1 text-base font-semibold text-slate-900">What do you call these?</h2>
        <p className="mb-3 text-sm text-slate-500">
          The word customers and you see — e.g. Bay, Chair, Room, Table, Slot.
        </p>
        <form onSubmit={saveLabel} className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            maxLength={32}
            placeholder="Station"
            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 sm:max-w-xs"
          />
          <button
            type="submit"
            disabled={savingLabel || labelDraft.trim() === label}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {savingLabel ? "Saving…" : "Save label"}
          </button>
        </form>
      </section>

      {/* Add station */}
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Add {label.toLowerCase()}</h2>
        <form onSubmit={addResource} className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={suggestedName}
            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="w-full rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {saving ? "Adding…" : `Add ${label.toLowerCase()}`}
          </button>
        </form>
      </section>

      {/* List */}
      {resources.length === 0 ? (
        <p className="mt-6 rounded-md border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          No {label.toLowerCase()}s yet. Add your first one above — you need at
          least one for customers to book.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {resources.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center"
            >
              <div className="flex-1">
                {editingId === r.id ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                    <button
                      type="button"
                      onClick={() => saveRename(r.id)}
                      disabled={!editName.trim()}
                      className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <p className="font-semibold text-slate-900">{r.name}</p>
                )}
              </div>

              {editingId !== r.id && (
                <div className="flex flex-shrink-0 items-center gap-2">
                  <StatusPill active={r.is_active} />
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(r.id);
                      setEditName(r.name);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Pencil size={14} />
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleActive(r)}
                    className="inline-flex items-center justify-center rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    {r.is_active ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingId(r.id)}
                    aria-label={`Remove ${r.name}`}
                    className="inline-flex items-center justify-center rounded-md border border-red-200 px-2.5 py-1.5 text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {deletingId != null && (
        <ConfirmationDialog
          open
          title={`Remove this ${label.toLowerCase()}?`}
          description="If it has bookings it's deactivated (kept for history); otherwise it's deleted. Either way it stops accepting new bookings and your capacity drops by one."
          variant="danger"
          confirmLabel="Remove"
          onConfirm={confirmDelete}
          onCancel={() => setDeletingId(null)}
        />
      )}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {active ? "Active" : "Inactive"}
    </span>
  );
}
