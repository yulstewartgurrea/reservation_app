"use client";

/**
 * Search input + status filter + sort dropdown for the services grid.
 *
 * Pure UI: state lives in the parent panel so a re-render here doesn't reset
 * the search input. Changes call back through `onChange*` handlers; the parent
 * is responsible for debouncing the search query before refetching.
 */

import { Search } from "lucide-react";

export type StatusFilter = "all" | "active" | "inactive";
export type SortKey = "name-asc" | "name-desc" | "price-asc" | "price-desc";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "name-asc", label: "Name (A–Z)" },
  { value: "name-desc", label: "Name (Z–A)" },
  { value: "price-asc", label: "Price (low to high)" },
  { value: "price-desc", label: "Price (high to low)" },
];

export function ServiceFilterBar({
  query,
  status,
  sort,
  onQueryChange,
  onStatusChange,
  onSortChange,
}: {
  query: string;
  status: StatusFilter;
  sort: SortKey;
  onQueryChange: (v: string) => void;
  onStatusChange: (v: StatusFilter) => void;
  onSortChange: (v: SortKey) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center">
      <label className="relative flex-1">
        <span className="sr-only">Search services</span>
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search services..."
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </label>
      <FloatLabelSelect
        label="Status"
        value={status}
        options={STATUS_OPTIONS}
        onChange={(v) => onStatusChange(v as StatusFilter)}
      />
      <FloatLabelSelect
        label="Sort by"
        value={sort}
        options={SORT_OPTIONS}
        onChange={(v) => onSortChange(v as SortKey)}
      />
    </div>
  );
}

function FloatLabelSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="relative inline-block min-w-[160px]">
      <span className="absolute left-3 top-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-lg border border-slate-200 bg-white pb-1.5 pl-3 pr-8 pt-5 text-sm font-medium text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
        ▾
      </span>
    </label>
  );
}
