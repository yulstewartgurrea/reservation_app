"use client";

import { type LucideIcon } from "lucide-react";

/**
 * Section block used by the shop create + edit forms.
 *
 * Layout: an icon-in-tinted-square on the left next to a numbered title +
 * subtitle, with the form fields filling the right side. Stacks vertically on
 * smaller screens.
 */
export function FormSection({
  index,
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  index?: number;
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="flex items-start gap-4 lg:w-44 lg:flex-shrink-0">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <Icon size={18} />
          </div>
          <div>
            <div className="font-semibold text-slate-900">
              {index != null && <span className="mr-1.5 text-slate-400">{index}.</span>}
              {title}
            </div>
            {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
          </div>
        </div>
        <div className="flex-1 space-y-4">{children}</div>
      </div>
    </section>
  );
}

/**
 * Compact field wrapper: label (with optional required asterisk) + slot for input.
 */
export function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}
