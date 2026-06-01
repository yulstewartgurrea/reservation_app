"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  Heart,
  LifeBuoy,
  LogOut,
  MessageSquare,
  Pencil,
  User as UserIcon,
  type LucideIcon,
} from "lucide-react";
import { Avatar } from "@/components/Avatar";

type UserSummary = {
  first_name: string;
  last_name: string;
  email: string;
  avatar?: string | null;
  email_verified_at?: string | null;
};

export function ProfileSidebar({
  user,
  onLogout,
}: {
  user: UserSummary;
  onLogout: () => void;
}) {
  const pathname = usePathname() ?? "";
  const fullName = `${user.first_name} ${user.last_name}`.trim() || user.email;
  const verified = !!user.email_verified_at;

  function isActive(href: string): boolean {
    if (href === "/profile") return pathname === "/profile";
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <aside className="lg:sticky lg:top-20 lg:h-fit">
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl">
          {user.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatar} alt={fullName} className="h-full w-full object-cover" />
          ) : (
            <Avatar name={fullName} size="lg" className="!rounded-xl" />
          )}
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold leading-tight text-slate-900">
            {fullName}
          </h2>
          <span
            className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
              verified ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {verified ? "Verified" : "Unverified"}
          </span>
        </div>
      </div>

      <Section title="Account">
        <NavItem href="/profile" icon={UserIcon} label="Overview" active={isActive("/profile")} />
        <NavItem
          href="/profile/edit"
          icon={Pencil}
          label="Edit profile"
          active={isActive("/profile/edit")}
        />
      </Section>

      <Section title="Activity">
        <NavItem
          href="/profile/bookings"
          icon={CalendarDays}
          label="My bookings"
          active={isActive("/profile/bookings")}
        />
        <NavItem
          href="/profile/favorites"
          icon={Heart}
          label="Favorites"
          active={isActive("/profile/favorites")}
        />
        <NavItem href="/chat" icon={MessageSquare} label="Messages" active={false} />
      </Section>

      <Section title="Help">
        <NavItem
          href="/support"
          icon={LifeBuoy}
          label="Support"
          active={isActive("/support")}
        />
      </Section>

      <div className="mt-6">
        <p className="px-3 text-xs font-semibold uppercase tracking-wider text-red-600">
          Danger zone
        </p>
        <button
          type="button"
          onClick={onLogout}
          className="mt-2 inline-flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-red-200 px-3.5 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
        >
          <LogOut size={16} />
          Log out
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
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  active: boolean;
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
    </Link>
  );
}
