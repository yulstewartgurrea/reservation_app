"use client";

/**
 * Compact pagination footer for the services grid.
 *
 * Renders "Showing X to Y of N services" + Previous / page-number buttons / Next.
 * Computes the visible page-number window so that long lists don't overflow.
 */

import { ChevronLeft, ChevronRight } from "lucide-react";

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  unitLabel = "services",
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  unitLabel?: string;
}) {
  if (total === 0) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const pageNumbers = buildPageWindow(page, totalPages);

  return (
    <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
      <p className="text-sm text-slate-500">
        Showing {start} to {end} of {total} {unitLabel}
      </p>
      <div className="flex items-center gap-1">
        <PageButton
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          ariaLabel="Previous page"
        >
          <ChevronLeft size={16} />
        </PageButton>
        {pageNumbers.map((n, i) =>
          n === "…" ? (
            <span key={`gap-${i}`} className="px-2 text-sm text-slate-400">
              …
            </span>
          ) : (
            <PageButton
              key={n}
              active={n === page}
              onClick={() => onPageChange(n)}
              ariaLabel={`Page ${n}`}
            >
              {n}
            </PageButton>
          )
        )}
        <PageButton
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          ariaLabel="Next page"
        >
          <ChevronRight size={16} />
        </PageButton>
      </div>
    </div>
  );
}

/**
 * Returns the page-number sequence to render — keeps it small by showing the
 * first page, last page, and a window of pages around the current one.
 * Example for 10 pages on page 5: [1, "…", 4, 5, 6, "…", 10].
 */
function buildPageWindow(current: number, total: number): (number | "…")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const window: (number | "…")[] = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  if (left > 2) window.push("…");
  for (let i = left; i <= right; i++) window.push(i);
  if (right < total - 1) window.push("…");
  window.push(total);
  return window;
}

function PageButton({
  children,
  onClick,
  disabled,
  active,
  ariaLabel,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-current={active ? "page" : undefined}
      className={`inline-flex h-9 min-w-[36px] items-center justify-center rounded-md border px-2 text-sm font-medium transition ${
        active
          ? "border-brand-600 bg-brand-600 text-white"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
      }`}
    >
      {children}
    </button>
  );
}
