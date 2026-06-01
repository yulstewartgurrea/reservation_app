"use client";

/**
 * "Help" link in the top nav for authenticated customers and shop owners.
 *
 * Visible only when there's a non-admin signed-in user; admins use the
 * dedicated /admin/tickets queue surfaced via the admin nav. Keeping this
 * out of TopNav.tsx itself keeps the JSX there focused on layout.
 */

import Link from "next/link";
import { LifeBuoy } from "lucide-react";

export function SupportNavLink() {
  return (
    <Link
      href="/support"
      aria-label="Help & support"
      className="inline-flex items-center gap-1 rounded p-2 text-slate-700 hover:bg-slate-100"
    >
      <LifeBuoy size={18} aria-hidden />
      <span className="hidden sm:inline text-sm">Help</span>
    </Link>
  );
}
