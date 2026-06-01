"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Root route.
 *
 * Handles two cases via a single client-side router.replace:
 *
 *  1. Genuine "/" visit → /shops (the public browse view).
 *
 *  2. CloudFront SPA fallback: when S3 404s on a deep route (e.g.
 *     /my-shops/123 — no flat .html exists because dynamic routes
 *     export only `_` placeholders), CloudFront serves this page's
 *     /index.html with the original URL still in the address bar.
 *     We tell the App Router to navigate to that URL so Next.js
 *     resolves and renders the matching route. Without this, the home
 *     page sits in front of the user (returning null) and the screen
 *     is blank.
 *
 * The redirect runs in useEffect — NOT via the server-component
 * `redirect()` helper — because that helper bakes a
 * <meta http-equiv="refresh"> into the static export, which fires
 * before hydration and clobbers case (2) by bouncing to /shops before
 * the client router can look at the URL.
 */
export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const target = window.location.pathname + window.location.search;
    router.replace(target === "/" ? "/shops" : target);
  }, [router]);

  return null;
}
