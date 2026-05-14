"use client";

/**
 * KPI strip shown above the services grid.
 *
 * Stats are fetched from `/services/stats/?shop=<id>` (not derived from the
 * paginated grid) so totals stay correct regardless of which page is shown.
 */

import {
  CheckCircle2,
  Clock,
  PauseCircle,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";

export type ServiceStatsData = {
  total: number;
  active: number;
  inactive: number;
  avg_duration: number;
};

export function ServiceStats({ stats }: { stats: ServiceStatsData | null }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Total services"
        value={stats?.total ?? 0}
        icon={ShoppingBag}
        tone="brand"
      />
      <StatCard
        label="Active services"
        value={stats?.active ?? 0}
        icon={CheckCircle2}
        tone="emerald"
      />
      <StatCard
        label="Inactive services"
        value={stats?.inactive ?? 0}
        icon={PauseCircle}
        tone="amber"
      />
      <StatCard
        label="Avg. duration"
        value={`${stats?.avg_duration ?? 0} min`}
        icon={Clock}
        tone="sky"
      />
    </div>
  );
}

type StatTone = "brand" | "emerald" | "amber" | "sky";
const STAT_TONE: Record<StatTone, string> = {
  brand: "bg-brand-100 text-brand-700",
  emerald: "bg-emerald-100 text-emerald-700",
  amber: "bg-amber-100 text-amber-700",
  sky: "bg-sky-100 text-sky-700",
};

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone: StatTone;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <div
        className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg ${STAT_TONE[tone]}`}
      >
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-slate-500">{label}</p>
        <p className="text-xl font-bold text-slate-900">{value}</p>
      </div>
    </div>
  );
}
