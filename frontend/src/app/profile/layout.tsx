"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ProfileSidebar } from "./_components/Sidebar";

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, fetchMe, logout } = useAuth();

  useEffect(() => {
    fetchMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user) return;
    if (user.role === "shop_owner") router.replace("/my-shops");
    else if (user.role === "admin") router.replace("/admin");
  }, [user, router]);

  function handleLogout() {
    logout();
    router.push("/login");
  }

  if (!user) {
    return (
      <div className="py-12">
        <p className="rounded-md border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          Please sign in to view your profile.
        </p>
      </div>
    );
  }

  if (user.role !== "customer") {
    return null;
  }

  return (
    <div className="grid gap-6 py-4 lg:grid-cols-[240px_1fr]">
      <ProfileSidebar user={user} onLogout={handleLogout} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
