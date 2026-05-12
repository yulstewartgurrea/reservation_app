"use client";

import { type LucideIcon } from "lucide-react";

/**
 * Sidebar info card with optional icon, title, body paragraph, and/or
 * bulleted list. Used on shop create + edit pages for tips and helpful
 * context.
 */
export function SidebarCard({
  tone = "slate",
  icon: Icon,
  title,
  body,
  bullets,
  children,
}: {
  tone?: "brand" | "slate";
  icon?: LucideIcon;
  title: string;
  body?: string;
  bullets?: string[];
  /** Custom content rendered after body/bullets. */
  children?: React.ReactNode;
}) {
  const palette =
    tone === "brand"
      ? "border-brand-100 bg-brand-50/60"
      : "border-slate-200 bg-white";
  return (
    <div className={`rounded-2xl border p-5 ${palette}`}>
      {Icon && (
        <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-100 text-brand-600">
          <Icon size={16} />
        </div>
      )}
      <div className="font-semibold text-slate-900">{title}</div>
      {body && <p className="mt-1 text-sm text-slate-600">{body}</p>}
      {bullets && (
        <ul className="mt-3 space-y-2 text-sm text-slate-600">
          {bullets.map((b) => (
            <li key={b} className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-400" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
