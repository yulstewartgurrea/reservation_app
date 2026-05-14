"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  Heart,
  Mail,
  Pencil,
  Phone,
  ShieldAlert,
  User as UserIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatApiError } from "@/lib/errors";
import { Avatar } from "@/components/Avatar";
import { PageHeader } from "@/components/PageHeader";

type Reservation = {
  id: number;
  status:
    | "pending"
    | "confirmed"
    | "completed"
    | "cancelled_by_customer"
    | "cancelled_by_shop"
    | "no_show";
  start_at: string;
};

const UPCOMING_STATUSES: Reservation["status"][] = ["pending", "confirmed"];

type FavoriteShop = { id: number };

export default function ProfileOverviewPage() {
  const { user } = useAuth();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [favoritesCount, setFavoritesCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchActivity = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [resvRes, favRes] = await Promise.all([
        api.get("/reservations/"),
        api.get("/shops/favorites/").catch(() => ({ data: [] })),
      ]);
      const rows: Reservation[] = resvRes.data.results ?? resvRes.data;
      const favs: FavoriteShop[] = favRes.data.results ?? favRes.data ?? [];
      setReservations(rows);
      setFavoritesCount(favs.length);
    } catch (err) {
      setLoadError(formatApiError(err, "Failed to load your activity."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user) return null;

  const fullName = `${user.first_name} ${user.last_name}`.trim() || user.email;
  const now = new Date();
  const upcoming = reservations.filter(
    (r) =>
      UPCOMING_STATUSES.includes(r.status) && new Date(r.start_at) >= now
  ).length;
  const completed = reservations.filter((r) => r.status === "completed").length;
  const verified = !!user.email_verified_at;

  return (
    <div className="space-y-6 py-4">
      <PageHeader
        icon={UserIcon}
        title="Profile"
        description="Manage your account and review your activity."
        actions={
          <Link
            href="/profile/edit"
            className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <Pencil size={16} />
            Edit profile
          </Link>
        }
      />

      {loadError && (
        <div className="flex flex-col gap-2 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 sm:flex-row sm:items-center sm:justify-between">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={fetchActivity}
            className="self-start rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100 sm:self-auto"
          >
            Try again
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          icon={CalendarClock}
          label="Upcoming bookings"
          value={loading ? "—" : String(upcoming)}
          accent="bg-brand-50 text-brand-600"
        />
        <KpiCard
          icon={CalendarCheck}
          label="Completed bookings"
          value={loading ? "—" : String(completed)}
          accent="bg-emerald-50 text-emerald-600"
        />
        <KpiCard
          icon={Heart}
          label="Favorites"
          value={loading ? "—" : String(favoritesCount)}
          accent="bg-rose-50 text-rose-600"
        />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl">
            {user.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatar}
                alt={fullName}
                className="h-full w-full object-cover"
              />
            ) : (
              <Avatar name={fullName} size="lg" className="!h-16 !w-16 !text-lg !rounded-2xl" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold text-slate-900">{fullName}</h2>
            <p className="text-sm text-slate-500">
              {user.role === "customer"
                ? "Customer"
                : user.role === "shop_owner"
                  ? "Shop owner"
                  : "Admin"}
            </p>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InfoRow icon={Mail} label="Email" value={user.email}>
            {verified ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                <CheckCircle2 size={12} />
                Verified
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                <ShieldAlert size={12} />
                Unverified
              </span>
            )}
          </InfoRow>
          <InfoRow
            icon={Phone}
            label="Phone"
            value={user.phone?.trim() || <span className="text-slate-400">Not provided</span>}
          />
          <InfoRow
            icon={UserIcon}
            label="Username"
            value={user.username || <span className="text-slate-400">—</span>}
          />
        </dl>

        {(user.no_show_count_90d ?? 0) > 0 || (user.cancellation_strikes_90d ?? 0) > 0 ? (
          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <p className="font-medium">Account health</p>
            <p className="mt-1 text-xs">
              No-shows (90d): {user.no_show_count_90d ?? 0} · Cancellation strikes (90d):{" "}
              {user.cancellation_strikes_90d ?? 0}
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${accent}`}>
        <Icon size={20} />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
        <p className="mt-0.5 text-xl font-bold text-slate-900">{value}</p>
      </div>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-500">
        <Icon size={14} />
        {label}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-sm text-slate-900">
        <span className="truncate">{value}</span>
        {children}
      </div>
    </div>
  );
}
