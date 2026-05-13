"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/errors";

type Staff = {
  id: number;
  shop: number;
  name: string;
  role: string;
  is_active: boolean;
};

export default function StaffPage() {
  const { id } = useParams<{ id: string }>();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data } = await api.get(`/shops/staff/`, { params: { shop: id } });
    setStaff(data.results ?? data);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post(`/shops/staff/`, { shop: Number(id), name, role, is_active: true });
      setName("");
      setRole("");
      load();
    } catch (err) {
      setError(formatApiError(err, "Failed to add."));
    }
  }

  async function toggleActive(s: Staff) {
    await api.patch(`/shops/staff/${s.id}/`, { is_active: !s.is_active });
    load();
  }

  async function remove(s: Staff) {
    if (!confirm(`Remove ${s.name}?`)) return;
    await api.delete(`/shops/staff/${s.id}/`);
    load();
  }

  return (
    <div className="mx-auto max-w-2xl py-6">
      <div className="mb-4">
        <Link
          href={`/dashboard/shops/${id}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft size={16} />
          Back
        </Link>
      </div>
      <h1 className="text-2xl font-semibold">Staff</h1>
      <p className="mt-1 text-sm text-slate-600">
        Add staff members so customers can pick a specific person at booking time.
      </p>

      <form onSubmit={add} className="mt-6 flex flex-wrap items-end gap-2 rounded-md border border-slate-200 bg-white p-3">
        <div className="flex-1">
          <label className="block text-sm font-medium">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium">Role</label>
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Stylist"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700"
        >
          Add staff
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <ul className="mt-6 space-y-2">
        {staff.length === 0 ? (
          <li className="text-sm text-slate-500">No staff yet.</li>
        ) : (
          staff.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between rounded-md border border-slate-200 bg-white p-3 text-sm"
            >
              <div>
                <div className="font-medium">{s.name}</div>
                <div className="text-slate-600">{s.role || "—"}</div>
                {!s.is_active && (
                  <span className="mt-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                    inactive
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Link
                  href={`/dashboard/shops/${id}/staff/${s.id}/hours`}
                  className="rounded border border-slate-300 px-3 py-1 text-xs"
                >
                  Hours
                </Link>
                <button
                  onClick={() => toggleActive(s)}
                  className="rounded border border-slate-300 px-3 py-1 text-xs"
                >
                  {s.is_active ? "Deactivate" : "Activate"}
                </button>
                <button
                  onClick={() => remove(s)}
                  className="rounded border border-red-300 px-3 py-1 text-xs text-red-700"
                >
                  Remove
                </button>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
