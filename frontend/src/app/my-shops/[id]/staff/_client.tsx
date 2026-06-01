"use client";

/**
 * Staff management page.
 *
 * Layout (matches the mockup):
 * - KPI strip: total / active / inactive — fetched from /shops/staff/stats/
 * - Add staff card: full name, role, phone or email (any combination)
 * - Filter bar: search input + status filter (all/active/inactive)
 * - List rows: avatar, name, role, contact, status pill, hours link,
 *   Edit (inline-edit mode) + Delete
 *
 * Edit reuses the same form — clicking Edit on a row pre-fills the form and
 * swaps the submit button label. Inactive staff are also returned by the list
 * endpoint (no extra param needed; the backend list isn't filtered).
 */

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useUrlParams } from "@/lib/useUrlParams";
import {
  CheckCircle2,
  Clock,
  MinusCircle,
  Pencil,
  Search,
  Trash2,
  UserCircle2,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/errors";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { Toast, ToastMessage } from "@/components/Toast";

type Staff = {
  id: number;
  shop: number;
  name: string;
  role: string;
  phone: string;
  email: string;
  photo: string | null;
  is_active: boolean;
};

type Stats = { total: number; active: number; inactive: number };

type StatusFilter = "all" | "active" | "inactive";

type FormState = {
  name: string;
  role: string;
  contact: string; // phone or email — we split on '@' at submit time
};

const EMPTY_FORM: FormState = { name: "", role: "", contact: "" };

export default function StaffPage() {
  const { id } = useUrlParams<{ id: string }>("/my-shops/[id]/staff");
  const [staff, setStaff] = useState<Staff[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  async function loadStaff() {
    if (!id) return;
    try {
      const { data } = await api.get(`/shops/staff/`, { params: { shop: id } });
      setStaff(data.results ?? data);
    } catch (err) {
      setToast({
        variant: "error",
        message: formatApiError(err, "Failed to load staff."),
      });
    }
  }

  async function loadStats() {
    if (!id) return;
    try {
      const { data } = await api.get<Stats>(`/shops/staff/stats/`, {
        params: { shop: id },
      });
      setStats(data);
    } catch {
      // KPI failure shouldn't block the page.
    }
  }

  useEffect(() => {
    if (!id) return;
    loadStaff();
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Client-side filter (search + status). The dataset for a single shop is
  // small enough; promote to server params if it grows past a couple hundred.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return staff.filter((s) => {
      if (statusFilter === "active" && !s.is_active) return false;
      if (statusFilter === "inactive" && s.is_active) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.role.toLowerCase().includes(q)
      );
    });
  }, [staff, query, statusFilter]);

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
  }

  function startEdit(s: Staff) {
    setEditingId(s.id);
    setForm({
      name: s.name,
      role: s.role,
      contact: s.email || s.phone || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** Split the single "contact" input into phone vs email by presence of '@'. */
  function splitContact(contact: string): { phone: string; email: string } {
    const trimmed = contact.trim();
    if (!trimmed) return { phone: "", email: "" };
    return trimmed.includes("@")
      ? { phone: "", email: trimmed }
      : { phone: trimmed, email: "" };
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { phone, email } = splitContact(form.contact);
      const payload = {
        shop: Number(id),
        name: form.name.trim(),
        role: form.role.trim(),
        phone,
        email,
        is_active: true,
      };
      if (editingId) {
        await api.patch(`/shops/staff/${editingId}/`, payload);
        setToast({ variant: "success", message: "Staff member updated." });
      } else {
        await api.post(`/shops/staff/`, payload);
        setToast({ variant: "success", message: "Staff member added." });
      }
      resetForm();
      loadStaff();
      loadStats();
    } catch (err) {
      setToast({
        variant: "error",
        message: formatApiError(err, "Failed to save."),
      });
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(s: Staff) {
    try {
      await api.patch(`/shops/staff/${s.id}/`, { is_active: !s.is_active });
      loadStaff();
      loadStats();
    } catch (err) {
      setToast({ variant: "error", message: formatApiError(err) });
    }
  }

  async function confirmDelete() {
    if (deletingId == null) return;
    try {
      await api.delete(`/shops/staff/${deletingId}/`);
      setToast({ variant: "success", message: "Staff member removed." });
      if (editingId === deletingId) resetForm();
      setDeletingId(null);
      loadStaff();
      loadStats();
    } catch (err) {
      setToast({ variant: "error", message: formatApiError(err) });
    }
  }

  return (
    <div className="mx-auto max-w-5xl py-6">
      <PageHeader
        icon={Users}
        title="Staff"
        description="Add staff members so customers can choose a specific person when booking."
      />

      {/* KPI STRIP */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total staff"
          value={stats?.total ?? 0}
          hint="All staff members"
          icon={Users}
          tone="brand"
        />
        <StatCard
          label="Active staff"
          value={stats?.active ?? 0}
          hint="Currently active"
          icon={CheckCircle2}
          tone="emerald"
        />
        <StatCard
          label="Inactive staff"
          value={stats?.inactive ?? 0}
          hint="Not available"
          icon={MinusCircle}
          tone="slate"
        />
      </div>

      {/* ADD / EDIT FORM */}
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-base font-semibold text-slate-900">
          {editingId ? "Edit staff member" : "Add staff member"}
        </h2>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <FieldLabel label="Full name" required>
              <input
                type="text"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                required
                placeholder="e.g. Maria Santos"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </FieldLabel>
            <FieldLabel label="Role">
              <input
                type="text"
                value={form.role}
                onChange={(e) =>
                  setForm((f) => ({ ...f, role: e.target.value }))
                }
                placeholder="e.g. Stylist"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </FieldLabel>
            <FieldLabel label="Phone / Email (optional)">
              <input
                type="text"
                value={form.contact}
                onChange={(e) =>
                  setForm((f) => ({ ...f, contact: e.target.value }))
                }
                placeholder="e.g. 0917 123 4567 or maria@email.com"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </FieldLabel>
          </div>
          <div className="flex justify-end gap-2">
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={saving || !form.name.trim()}
              className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving…" : editingId ? "Save changes" : "Add staff"}
            </button>
          </div>
        </form>
      </section>

      {/* FILTER BAR */}
      <div className="mt-6 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Search staff</span>
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search staff by name or role..."
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </label>
        <StatusFilterPills value={statusFilter} onChange={setStatusFilter} />
      </div>

      {/* LIST */}
      {visible.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          {staff.length === 0
            ? "No staff yet. Add your first team member above."
            : "No staff match your filters."}
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {visible.map((s) => (
            <StaffRow
              key={s.id}
              staff={s}
              shopId={id}
              onEdit={() => startEdit(s)}
              onDelete={() => setDeletingId(s.id)}
              onToggleActive={() => toggleActive(s)}
            />
          ))}
        </ul>
      )}

      <p className="mt-4 text-sm text-slate-500">
        Showing {visible.length} of {staff.length} staff member
        {staff.length === 1 ? "" : "s"}
      </p>

      {deletingId != null && (
        <ConfirmationDialog
          open
          title="Remove this staff member?"
          description="They'll no longer appear in the booking flow. Past reservations referencing them stay intact."
          variant="danger"
          confirmLabel="Remove staff"
          onConfirm={confirmDelete}
          onCancel={() => setDeletingId(null)}
        />
      )}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

function FieldLabel({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}

type StatTone = "brand" | "emerald" | "slate";
const STAT_TONE: Record<StatTone, string> = {
  brand: "bg-brand-100 text-brand-700",
  emerald: "bg-emerald-100 text-emerald-700",
  slate: "bg-slate-100 text-slate-500",
};

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  icon: typeof Users;
  tone: StatTone;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <div
        className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg ${STAT_TONE[tone]}`}
      >
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-slate-500">{label}</p>
        <p className="text-xl font-bold text-slate-900">{value}</p>
        <p className="truncate text-xs text-slate-400">{hint}</p>
      </div>
    </div>
  );
}

function StatusFilterPills({
  value,
  onChange,
}: {
  value: StatusFilter;
  onChange: (v: StatusFilter) => void;
}) {
  const options: { value: StatusFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
  ];
  return (
    <div className="flex gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
            value === o.value
              ? "bg-slate-900 text-white"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function StaffRow({
  staff,
  shopId,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  staff: Staff;
  shopId: string;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
}) {
  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
      {/* Avatar + name/role */}
      <div className="flex flex-1 items-center gap-3">
        <Avatar photo={staff.photo} name={staff.name} />
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900">{staff.name}</p>
          <p className="truncate text-sm text-slate-500">{staff.role || "—"}</p>
        </div>
      </div>

      {/* Contact */}
      <div className="min-w-0 flex-1 space-y-0.5 text-sm">
        {staff.phone && (
          <p className="truncate text-slate-700">📞 {staff.phone}</p>
        )}
        {staff.email && (
          <p className="truncate text-slate-700">✉️ {staff.email}</p>
        )}
        {!staff.phone && !staff.email && (
          <p className="text-slate-300">No contact info</p>
        )}
      </div>

      {/* Status + hours link */}
      <div className="flex flex-shrink-0 flex-col items-start gap-1 sm:items-end">
        <StatusPill active={staff.is_active} />
        <Link
          href={`/my-shops/${shopId}/staff/${staff.id}/hours`}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-brand-700"
        >
          <Clock size={12} />
          Manage hours
        </Link>
      </div>

      {/* Actions */}
      <div className="flex flex-shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Pencil size={14} />
          Edit
        </button>
        <button
          type="button"
          onClick={onToggleActive}
          className="inline-flex items-center justify-center rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          {staff.is_active ? "Deactivate" : "Activate"}
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Remove staff"
          className="inline-flex items-center justify-center rounded-md border border-red-200 px-2.5 py-1.5 text-red-600 hover:bg-red-50"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </li>
  );
}

function Avatar({ photo, name }: { photo: string | null; name: string }) {
  if (photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photo}
        alt={name}
        className="h-12 w-12 flex-shrink-0 rounded-full object-cover"
      />
    );
  }
  const initials = name
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  if (!initials) {
    return (
      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <UserCircle2 size={28} />
      </div>
    );
  }
  return (
    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
      {initials}
    </div>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        active
          ? "bg-emerald-100 text-emerald-700"
          : "bg-slate-100 text-slate-600"
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {active ? "Active" : "Inactive"}
    </span>
  );
}
