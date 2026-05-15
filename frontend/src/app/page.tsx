"use client";

/**
 * Root route ("/").
 *
 * Logged-out or root visits bounce to /shops (the public browse view).
 *
 * The redirect runs client-side instead of via the server-component
 * `redirect()` helper — that helper bakes a `<meta http-equiv="refresh">`
 * into the static export, which fires before Next.js hydrates. That breaks
 * the CloudFront SPA fallback: a 404 on a deep route (e.g. /my-shops/123)
 * gets rewritten to /index.html, the meta-refresh kicks in, and the user
 * ends up on /shops instead of the deep route they asked for.
 *
 * By keeping the redirect in a useEffect gated on `pathname === "/"`,
 * the served-as-fallback case leaves the URL alone and Next.js's client
 * router renders the real route the user requested.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    if (window.location.pathname === "/") {
      router.replace("/shops");
    }
  }, [router]);

  return null;
}
