"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { HoursEditor } from "@/components/HoursEditor";

type StaffHoursRow = {
  weekday: number;
  is_off: boolean;
  start_time: string | null;
  end_time: string | null;
};

export default function StaffHoursPage() {
  const { id, staffId } = useParams<{ id: string; staffId: string }>();
  const router = useRouter();
  const [name, setName] = useState("");

  useEffect(() => {
    api.get(`/shops/staff/${staffId}/`).then((r) => setName(r.data.name));
  }, [staffId]);

  return (
    <div className="mx-auto max-w-2xl py-6">
      <div className="mb-2 flex items-center justify-between">
        <span />
        <button
          onClick={() => router.push(`/dashboard/shops/${id}/staff`)}
          className="text-sm text-slate-600 hover:underline"
        >
          ← Back to staff
        </button>
      </div>
      <HoursEditor<StaffHoursRow, StaffHoursRow>
        title={`${name || "Staff"} hours`}
        description="Set the staff member's weekly schedule. Customers can only book this person during their working hours (intersected with shop hours)."
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
