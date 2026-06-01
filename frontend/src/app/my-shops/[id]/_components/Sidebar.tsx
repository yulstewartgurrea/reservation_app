"use client";

/**
 * Left-rail navigation for the shop dashboard.
 *
 * All items are `<Link>`s — switching sections never unmounts the layout, so
 * the sidebar stays visible and only the content area swaps. The active item
 * is determined from the current URL via `usePathname()`, so deep-links and
 * the browser back button behave naturally.
 *
 * "Pause shop" / "Publish shop" is the lone non-link action and lives in a
 * Danger Zone footer; it calls back to the layout which owns the shop state.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BellRing,
  Building2,
  CalendarClock,
  CalendarDays,
  Clock,
  Grid3x3,
  Image as ImageIcon,
  LifeBuoy,
  PauseCircle,
  Pencil,
  PlayCircle,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

type ShopStatus = "active" | "paused" | "pending";

type ShopSummary = {
  id: number;
  name: string;
  status: ShopStatus;
  cover_photo?: string | null;
} | null;

const STATUS_PILL: Record<ShopStatus, string> = {
  active: "bg-emerald-100 text-emerald-700",
  paused: "bg-amber-100 text-amber-700",
  pending: "bg-slate-100 text-slate-700",
};

export function Sidebar({
  shopId,
  shop,
  pendingCount,
  onTogglePublish,
}: {
  shopId: string;
  shop: ShopSummary;
  pendingCount: number;
  onTogglePublish: () => void;
}) {
  const pathname = usePathname() ?? "";
  const base = `/my-shops/${shopId}`;

  // A nav item is "active" when its href is either the current path or a
  // strict path-segment prefix of it (so /services/new still highlights
  // "Services"). The root `/my-shops/[id]` highlights nothing on its own
  // — root visits redirect to /services, so the visible URL is always a
  // child route.
  function isActive(href: string): boolean {
    if (href === base) return pathname === base;
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <aside className="lg:sticky lg:top-20 lg:h-fit">
      {/* Shop identity card */}
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-brand-600 text-white">
          {shop?.cover_photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={shop.cover_photo}
              alt={shop.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <Building2 size={24} strokeWidth={1.75} />
          )}
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold leading-tight text-slate-900">
            {shop?.name ?? "Shop"}
          </h2>
          {shop && (
            <span
              className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_PILL[shop.status]}`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {shop.status[0].toUpperCase() + shop.status.slice(1)}
            </span>
          )}
        </div>
      </div>

      <Section title="Shop management">
        <NavItem href={`${base}/edit`} icon={Pencil} label="Edit shop" active={isActive(`${base}/edit`)} />
        <NavItem href={`${base}/hours`} icon={Clock} label="Hours" active={isActive(`${base}/hours`)} />
        <NavItem
          href={`${base}/overrides`}
          icon={CalendarClock}
          label="Overrides"
          active={isActive(`${base}/overrides`)}
        />
        <NavItem
          href={`${base}/resources`}
          icon={Grid3x3}
          label="Stations"
          active={isActive(`${base}/resources`)}
        />
        <NavItem href={`${base}/staff`} icon={Users} label="Staff" active={isActive(`${base}/staff`)} />
        <NavItem
          href={`${base}/photos`}
          icon={ImageIcon}
          label="Photos"
          active={isActive(`${base}/photos`)}
        />
        <NavItem
          href={`${base}/analytics`}
          icon={BarChart3}
          label="Analytics"
          active={isActive(`${base}/analytics`)}
        />
        <NavItem
          href={`${base}/reminders`}
          icon={BellRing}
          label="Reminders"
          active={isActive(`${base}/reminders`)}
        />
      </Section>

      <Section title="Operations">
        <NavItem
          href={`${base}/services`}
          icon={Wrench}
          label="Services"
          active={isActive(`${base}/services`)}
        />
        <NavItem
          href={`${base}/reservations`}
          icon={CalendarDays}
          label="Reservations"
          active={isActive(`${base}/reservations`)}
          badge={pendingCount > 0 ? pendingCount : undefined}
        />
      </Section>

      <Section title="Help">
        {/* Support tickets aren't shop-scoped in v1 — this links to the
            shared /support area so the owner sees all their tickets. */}
        <NavItem
          href="/support"
          icon={LifeBuoy}
          label="Support"
          active={pathname === "/support" || pathname.startsWith("/support/")}
        />
      </Section>

      {/* Danger zone — publish/pause is a state change with customer-visible impact */}
      <div className="mt-6">
        <p className="px-3 text-xs font-semibold uppercase tracking-wider text-red-600">
          Danger zone
        </p>
        <button
          type="button"
          onClick={onTogglePublish}
          className={`mt-2 inline-flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-3.5 py-2 text-sm font-medium transition ${
            shop?.status === "active"
              ? "border-red-200 text-red-600 hover:bg-red-50"
              : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
          }`}
        >
          {shop?.status === "active" ? (
            <>
              <PauseCircle size={16} />
              Pause shop
            </>
          ) : (
            <>
              <PlayCircle size={16} />
              Publish shop
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </p>
      <nav className="mt-2 space-y-0.5">{children}</nav>
    </div>
  );
}

function NavItem({
  href,
  icon: Icon,
  label,
  active,
  badge,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  active: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
        active ? "bg-brand-50 text-brand-700" : "text-slate-700 hover:bg-slate-100"
      }`}
    >
      <Icon size={18} className={active ? "text-brand-600" : "text-slate-500"} />
      <span className="flex-1">{label}</span>
      {badge !== undefined && (
        <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-100 px-1.5 text-xs font-medium text-amber-800">
          {badge}
        </span>
      )}
    </Link>
  );
}
