"use client";

import { useEffect, useState } from "react";

/**
 * Pure helper exported for testability. Given a Next.js-style route pattern
 * (`/my-shops/[id]/staff/[staffId]`) and a real URL pathname
 * (`/my-shops/2/staff/3`), returns `{ id: "2", staffId: "3" }`.
 *
 * Static segments in `pattern` aren't validated against the URL — we just
 * extract values at positions where the pattern segment is `[name]`. Missing
 * URL segments (the URL is shorter than the pattern) return empty strings.
 */
export function parseUrlParams(pattern: string, pathname: string): Record<string, string> {
  const patternSegs = pattern.split("/").filter(Boolean);
  const urlSegs = pathname.split("/").filter(Boolean);
  const out: Record<string, string> = {};
  patternSegs.forEach((seg, i) => {
    if (seg.startsWith("[") && seg.endsWith("]")) {
      out[seg.slice(1, -1)] = urlSegs[i] ?? "";
    }
  });
  return out;
}

/**
 * Drop-in replacement for `next/navigation`'s `useParams` that resolves
 * dynamic-segment values from `window.location.pathname` instead of the
 * Next.js RSC payload.
 *
 * Why this exists:
 *   With `output: "export"` + `generateStaticParams() => [{ id: "_" }]`,
 *   Next.js bakes the placeholder string "_" into every dynamic route's
 *   static HTML (look for `"id":"_"` in `frontend/out/my-shops/_/services.html`).
 *   The stock `useParams()` reads from that baked payload, so it returns
 *   "_" forever — never the real URL value like "2". This hook bypasses
 *   the payload and reads the URL directly.
 *
 * First render returns an empty-string for every key (the URL is read in
 * `useEffect`, which runs after mount). Callers MUST guard side effects:
 *
 *   const { id } = useUrlParams<{ id: string }>("/my-shops/[id]");
 *   useEffect(() => {
 *     if (!id) return;
 *     api.get(`/shops/${id}/`);
 *   }, [id]);
 *
 * @param pattern The route file path with `[name]` segments, matching how
 *                Next.js names dynamic-route directories. Must start with `/`.
 */
export function useUrlParams<T extends Record<string, string>>(pattern: string): T {
  const [params, setParams] = useState<T>(() => parseUrlParams(pattern, "") as T);

  useEffect(() => {
    setParams(parseUrlParams(pattern, window.location.pathname) as T);
  }, [pattern]);

  return params;
}
