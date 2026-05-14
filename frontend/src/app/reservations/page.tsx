"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { BookingsPanel } from "@/app/profile/_components/BookingsPanel";

// Standalone "My bookings" route. Used by post-booking redirects
// (book / reschedule / review) and any external bookmark.
//
// Shop owners manage reservations per-shop under `/my-shops/<id>/reservations`,
// so if one lands here we bounce them. The customer experience lives in the
// shared <BookingsPanel /> — see also `/profile/bookings`.
export default function ReservationsPage() {
  const router = useRouter();
  const { user, fetchMe } = useAuth();

  useEffect(() => {
    fetchMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user?.role === "shop_owner") router.replace("/my-shops");
  }, [user, router]);

  if (user?.role === "shop_owner") return null;

  return <BookingsPanel onBack={() => router.back()} />;
}
