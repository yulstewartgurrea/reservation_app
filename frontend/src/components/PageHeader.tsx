"use client";

/**
 * Shared page header for shop-management subpages.
 *
 * Renders a uniform layout: a back-pill link at the top, then the page title
 * (with optional subtitle) on the left and an optional `actions` slot on the
 * right. Every subpage of the shop dashboard (hours, staff, overrides, edit,
 * analytics, reminders, photos, services) should use this so the back button,
 * spacing, and typography stay identical across the app.
 *
 * `icon` is an optional Lucide icon shown next to the title — useful for
 * top-level pages like Reminders or Hours where the icon doubles as a
 * page-type hint.
 */

import Link from "next/link";
import { ArrowLeft, type LucideIcon } from "lucide-react";

export function PageHeader({
  backHref,
  onBack,
  backLabel = "Back",
  title,
  description,
  icon: Icon,
  actions,
}: {
  /** Renders a back pill that navigates to this URL. Most shop-dashboard
   * subpages render inside the dashboard layout (which provides the sidebar
   * as the primary nav), so they omit both back props. */
  backHref?: string;
  /** Renders a back pill that invokes this callback instead of navigating.
   * Use for `router.back()`-style "previous page" navigation. Ignored when
   * `backHref` is also provided. */
  onBack?: () => void;
  /** Label inside the back pill; defaults to "Back". */
  backLabel?: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** Right-aligned action slot — buttons, links, badges. */
  actions?: React.ReactNode;
}) {
  const backClasses =
    "inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50";

  return (
    <header className="mb-6 space-y-4">
      {backHref ? (
        <Link href={backHref} className={backClasses}>
          <ArrowLeft size={16} />
          {backLabel}
        </Link>
      ) : onBack ? (
        <button type="button" onClick={onBack} className={backClasses}>
          <ArrowLeft size={16} />
          {backLabel}
        </button>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 sm:text-3xl">
            {Icon && <Icon size={26} className="text-brand-600" />}
            {title}
          </h1>
          {description && (
            <p className="mt-1.5 text-sm text-slate-600">{description}</p>
          )}
        </div>
        {actions && <div className="flex flex-shrink-0 gap-2">{actions}</div>}
      </div>
    </header>
  );
}
