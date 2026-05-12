"use client";

import { type LucideIcon } from "lucide-react";

export type ChipColor = "slate" | "amber" | "emerald" | "blue" | "red";

const COLORS: Record<
  ChipColor,
  { active: string; iconActive: string; iconInactive: string }
> = {
  slate: {
    active: "border-slate-300 bg-slate-100 text-slate-900",
    iconActive: "text-slate-700",
    iconInactive: "text-slate-500",
  },
  amber: {
    active: "border-amber-300 bg-amber-50 text-amber-900",
    iconActive: "text-amber-600",
    iconInactive: "text-amber-500",
  },
  emerald: {
    active: "border-emerald-300 bg-emerald-50 text-emerald-900",
    iconActive: "text-emerald-600",
    iconInactive: "text-emerald-500",
  },
  blue: {
    active: "border-blue-300 bg-blue-50 text-blue-900",
    iconActive: "text-blue-600",
    iconInactive: "text-blue-500",
  },
  red: {
    active: "border-red-300 bg-red-50 text-red-900",
    iconActive: "text-red-600",
    iconInactive: "text-red-500",
  },
};

/**
 * Pill-style filter chip with an icon + label.
 *
 * Used in the dashboard Reservations tab to filter by status. The color prop
 * tints the icon (always) and the chip background (when active). Inactive
 * chips have a neutral white background with a thin slate border.
 */
export function FilterChip({
  active,
  onClick,
  icon: Icon,
  label,
  color = "slate",
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
  color?: ChipColor;
  count?: number;
}) {
  const palette = COLORS[color];
  const base =
    "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition";
  return (
    <button
      onClick={onClick}
      className={`${base} ${
        active
          ? palette.active
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      <Icon
        size={16}
        className={active ? palette.iconActive : palette.iconInactive}
      />
      {label}
      {count !== undefined && (
        <span
          className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs ${
            active ? "bg-white/70" : "bg-slate-100 text-slate-600"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}
