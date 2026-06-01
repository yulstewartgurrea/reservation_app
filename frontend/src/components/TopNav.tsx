"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Avatar } from "./Avatar";
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
        <Link href="/shops" aria-label="Browse shops" className="flex items-center">
          <Image
            src="/logo.png"
            alt="BookMe"
            width={888}
            height={282}
            priority
            className="h-9 w-auto"
          />
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
                <>
                  <Link
                    href="/my-shops"
                    className="rounded px-3 py-2 hover:bg-slate-100"
                  >
                    My shops
                  </Link>
                  <Link
                    href="/owner/billing"
                    className="rounded px-3 py-2 hover:bg-slate-100"
                  >
                    Billing
                  </Link>
                </>
              )}
              {user.role === "admin" && (
                <Link href="/admin" className="rounded px-3 py-2 hover:bg-slate-100">
                  Admin
                </Link>
              )}
              <ChatBadge />
              <NotificationBell />
              {user.role === "customer" && (
                <Link
                  href="/profile"
                  aria-label="Profile"
                  className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full ring-1 ring-slate-200 hover:ring-brand-300"
                >
                  {user.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={user.avatar}
                      alt={`${user.first_name} ${user.last_name}`.trim() || user.email}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Avatar
                      name={`${user.first_name} ${user.last_name}`.trim() || user.email}
                      size="sm"
                    />
                  )}
                </Link>
              )}
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
