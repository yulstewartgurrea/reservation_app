"use client";

import {
  CATEGORY_LABEL,
  PRIORITY_LABEL,
  STATUS_LABEL,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type AdminTicketFilters,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
} from "@/lib/support";

/**
 * Admin queue filter bar. Pure presentational — the parent owns state and
 * decides what "Apply" does (we apply on each change for snappy filtering).
 */
export function TicketFilters({
  value,
  onChange,
  onClear,
}: {
  value: AdminTicketFilters;
  onChange: (next: AdminTicketFilters) => void;
  onClear: () => void;
}) {
  const hasAny = Boolean(
    value.status || value.category || value.priority || value.q || value.assigned_to
  );

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Search">
          <input
            type="search"
            value={value.q ?? ""}
            onChange={(e) => onChange({ ...value, q: e.target.value })}
            placeholder="Subject, body, email…"
            className="h-11 w-full rounded-md border border-slate-300 px-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </Field>

        <Field label="Status">
          <select
            value={value.status ?? ""}
            onChange={(e) =>
              onChange({
                ...value,
                status: (e.target.value || undefined) as TicketStatus | undefined,
              })
            }
            className="h-11 w-full rounded-md border border-slate-300 px-2 text-sm"
          >
            <option value="">All statuses</option>
            {TICKET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Category">
          <select
            value={value.category ?? ""}
            onChange={(e) =>
              onChange({
                ...value,
                category:
                  (e.target.value || undefined) as TicketCategory | undefined,
              })
            }
            className="h-11 w-full rounded-md border border-slate-300 px-2 text-sm"
          >
            <option value="">All categories</option>
            {TICKET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Priority">
          <select
            value={value.priority ?? ""}
            onChange={(e) =>
              onChange({
                ...value,
                priority:
                  (e.target.value || undefined) as TicketPriority | undefined,
              })
            }
            className="h-11 w-full rounded-md border border-slate-300 px-2 text-sm"
          >
            <option value="">All priorities</option>
            {TICKET_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Assignee">
          <select
            value={value.assigned_to === undefined ? "" : String(value.assigned_to)}
            onChange={(e) => {
              const v = e.target.value;
              onChange({
                ...value,
                assigned_to:
                  v === ""
                    ? ""
                    : v === "me" || v === "unassigned"
                      ? v
                      : Number(v),
              });
            }}
            className="h-11 w-full rounded-md border border-slate-300 px-2 text-sm"
          >
            <option value="">All</option>
            <option value="me">Me</option>
            <option value="unassigned">Unassigned</option>
          </select>
        </Field>
      </div>

      {hasAny && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-medium text-slate-500 hover:text-slate-700 hover:underline"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-500">{label}</span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}
