"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/errors";
import { todayIso } from "@/lib/format";

type Override = {
  id: number;
  date: string;
  is_closed: boolean;
  open_time: string | null;
  close_time: string | null;
  note: string;
};

export default function OverridesPage() {
  const { id } = useParams<{ id: string }>();
  const [items, setItems] = useState<Override[]>([]);
  const [form, setForm] = useState({
    date: "",
    is_closed: true,
    open_time: "10:00",
    close_time: "16:00",
    note: "",
  });
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data } = await api.get(`/shops/${id}/overrides/`);
    setItems(data);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post(`/shops/${id}/overrides/`, {
        date: form.date,
        is_closed: form.is_closed,
        open_time: form.is_closed ? null : form.open_time,
        close_time: form.is_closed ? null : form.close_time,
        note: form.note,
      });
      setForm({ date: "", is_closed: true, open_time: "10:00", close_time: "16:00", note: "" });
      load();
    } catch (err) {
      setError(formatApiError(err, "Failed."));
    }
  }

  async function remove(overrideId: number) {
    if (!confirm("Remove this override?")) return;
    await api.delete(`/shops/${id}/overrides/${overrideId}/`);
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
      <h1 className="text-2xl font-semibold">Date overrides</h1>
      <p className="mt-1 text-sm text-slate-600">
        Use this for holidays, special hours, or one-off closures. Overrides take precedence over
        weekly hours.
      </p>

      <form
        onSubmit={add}
        className="mt-6 flex flex-wrap items-end gap-3 rounded-md border border-slate-200 bg-white p-3"
      >
        <div>
          <label className="block text-sm font-medium">Date</label>
          <input
            type="date"
            value={form.date}
            min={todayIso()}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            required
            className="mt-1 rounded-md border border-slate-300 px-2 py-1"
          />
        </div>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.is_closed}
            onChange={(e) => setForm((f) => ({ ...f, is_closed: e.target.checked }))}
          />
          Closed all day
        </label>
        {!form.is_closed && (
          <>
            <input
              type="time"
              value={form.open_time}
              onChange={(e) => setForm((f) => ({ ...f, open_time: e.target.value }))}
              className="rounded-md border border-slate-300 px-2 py-1"
            />
            <span>–</span>
            <input
              type="time"
              value={form.close_time}
              onChange={(e) => setForm((f) => ({ ...f, close_time: e.target.value }))}
              className="rounded-md border border-slate-300 px-2 py-1"
            />
          </>
        )}
        <input
          value={form.note}
          onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
          placeholder="Note (optional)"
          className="flex-1 rounded-md border border-slate-300 px-2 py-1"
        />
        <button
          type="submit"
          className="rounded-md bg-brand-600 px-3 py-2 text-sm text-white hover:bg-brand-700"
        >
          Add
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <ul className="mt-6 space-y-2">
        {items.length === 0 ? (
          <li className="text-sm text-slate-500">No overrides set.</li>
        ) : (
          items.map((o) => (
            <li
              key={o.id}
              className="flex items-center justify-between rounded-md border border-slate-200 bg-white p-3 text-sm"
            >
              <div>
                <div className="font-medium">{o.date}</div>
                <div className="text-slate-600">
                  {o.is_closed ? (
                    "Closed all day"
                  ) : (
                    <>
                      {o.open_time} – {o.close_time}
                    </>
                  )}
                  {o.note && <span className="text-slate-500"> · {o.note}</span>}
                </div>
              </div>
              <button
                onClick={() => remove(o.id)}
                className="rounded border border-red-300 px-3 py-1 text-xs text-red-700"
              >
                Remove
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
