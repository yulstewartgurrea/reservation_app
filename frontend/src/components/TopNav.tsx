"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { ChatBadge } from "./ChatBadge";
import { NotificationBell } from "./NotificationBell";

export function TopNav() {
  const { user, fetchMe, logout } = useAuth();

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="text-lg font-semibold text-brand-600">
          Reserva
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/shops" className="rounded px-3 py-2 hover:bg-slate-100">
            Shops
          </Link>
          <Link href="/services" className="rounded px-3 py-2 hover:bg-slate-100">
            Services
          </Link>
          {user ? (
            <>
              {user.role === "shop_owner" && (
                <Link href="/dashboard" className="rounded px-3 py-2 hover:bg-slate-100">
                  Dashboard
                </Link>
              )}
              {user.role === "admin" && (
                <Link href="/admin" className="rounded px-3 py-2 hover:bg-slate-100">
                  Admin
                </Link>
              )}
              <Link href="/reservations" className="rounded px-3 py-2 hover:bg-slate-100">
                {user.role === "shop_owner" ? "Inbox" : "My bookings"}
              </Link>
              {user.role === "customer" && (
                <Link href="/favorites" className="rounded px-3 py-2 hover:bg-slate-100">
                  Favorites
                </Link>
              )}
              <ChatBadge />
              <NotificationBell />
              <button
                onClick={logout}
                className="rounded px-3 py-2 text-slate-600 hover:bg-slate-100"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="rounded px-3 py-2 hover:bg-slate-100">
                Login
              </Link>
              <Link
                href="/register"
                className="rounded bg-brand-600 px-3 py-2 text-white hover:bg-brand-700"
              >
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
