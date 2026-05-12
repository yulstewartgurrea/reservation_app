"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { HoursEditor } from "@/components/HoursEditor";

type ShopHoursRow = {
  weekday: number;
  is_closed: boolean;
  open_time: string | null;
  close_time: string | null;
};

export default function ShopHoursPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="mx-auto max-w-2xl py-6">
      <div className="mb-4">
        <Link
          href={`/dashboard/shops/${id}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft size={16} />
          Back
        </Link>
      </div>
      <HoursEditor<ShopHoursRow, ShopHoursRow>
        title="Shop hours"
        description="Customers can only book during open hours. Defaults to closed everywhere — flip days to open."
        workingLabel="Open"
        load={async () => (await api.get(`/shops/${id}/hours/`)).data ?? []}
        save={async (rows) => {
          await api.put(`/shops/${id}/hours/`, rows);
        }}
        mapIn={(row) => ({
          closed: row.is_closed,
          start: row.open_time ?? "09:00",
          end: row.close_time ?? "17:00",
        })}
        mapOut={(row) => ({
          weekday: row.weekday,
          is_closed: row.closed,
          open_time: row.closed ? null : row.start,
          close_time: row.closed ? null : row.end,
        })}
      />
    </div>
  );
}
