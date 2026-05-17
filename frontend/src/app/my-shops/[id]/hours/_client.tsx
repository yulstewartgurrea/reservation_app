"use client";

import { Clock } from "lucide-react";
import { api } from "@/lib/api";
import { HoursEditor } from "@/components/HoursEditor";
import { PageHeader } from "@/components/PageHeader";
import { useUrlParams } from "@/lib/useUrlParams";

type ShopHoursRow = {
  weekday: number;
  is_closed: boolean;
  open_time: string | null;
  close_time: string | null;
};

export default function ShopHoursPage() {
  const { id } = useUrlParams<{ id: string }>("/my-shops/[id]/hours");
  if (!id) return null;

  return (
    <div className="mx-auto max-w-3xl py-6">
      <PageHeader
        icon={Clock}
        title="Shop hours"
        description="Customers can only book during open hours. Defaults to closed everywhere — flip days to open."
      />
      <HoursEditor<ShopHoursRow, ShopHoursRow>
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
