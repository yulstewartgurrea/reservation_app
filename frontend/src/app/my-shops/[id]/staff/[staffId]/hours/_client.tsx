"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Clock } from "lucide-react";
import { api } from "@/lib/api";
import { HoursEditor } from "@/components/HoursEditor";
import { PageHeader } from "@/components/PageHeader";

type StaffHoursRow = {
  weekday: number;
  is_off: boolean;
  start_time: string | null;
  end_time: string | null;
};

export default function StaffHoursPage() {
  const { id, staffId } = useParams<{ id: string; staffId: string }>();
  const [name, setName] = useState("");

  useEffect(() => {
    api.get(`/shops/staff/${staffId}/`).then((r) => setName(r.data.name));
  }, [staffId]);

  return (
    <div className="mx-auto max-w-3xl py-6">
      <PageHeader
        backHref={`/my-shops/${id}/staff`}
        backLabel="Back to staff"
        icon={Clock}
        title={`${name || "Staff"} hours`}
        description="Set this staff member's weekly schedule. Customers can only book them during their working hours (intersected with shop hours)."
      />
      <HoursEditor<StaffHoursRow, StaffHoursRow>
        workingLabel="Working"
        load={async () => (await api.get(`/shops/staff/${staffId}/hours/`)).data ?? []}
        save={async (rows) => {
          await api.put(`/shops/staff/${staffId}/hours/`, rows);
        }}
        mapIn={(row) => ({
          closed: row.is_off,
          start: row.start_time ?? "09:00",
          end: row.end_time ?? "17:00",
        })}
        mapOut={(row) => ({
          weekday: row.weekday,
          is_off: row.closed,
          start_time: row.closed ? null : row.start,
          end_time: row.closed ? null : row.end,
        })}
      />
    </div>
  );
}
