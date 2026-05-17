/**
 * Offline test harness for the `rewrite-html` CloudFront function.
 *
 * Mirrors the function source from main.tf and runs every URL pattern the
 * deployed app actually emits, asserting the rewrite output matches a file
 * that exists in frontend/out/.
 *
 * Run from repo root:
 *   node aws/layers/frontend_hosting/test_rewrite_html.mjs
 */

import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const outDir = resolve(repoRoot, "frontend/out");

// --- Function under test (keep in sync with main.tf rewrite_html.code) -----
function handler(event) {
  var req = event.request;
  var uri = req.uri;

  // /api/ and /ws/ go to the ALB origin — leave untouched.
  if (uri.startsWith("/api/") || uri.startsWith("/ws/")) return req;

  // Already a real file (has extension) — pass through.
  if (/\.[a-zA-Z0-9]+$/.test(uri)) return req;

  // Normalize trailing slash, then handle the root.
  var trimmed = uri.endsWith("/") ? uri.slice(0, -1) : uri;
  if (trimmed === "") {
    req.uri = "/index.html";
    return req;
  }

  // Replace every all-numeric path segment with "_" — Next.js's static
  // export emits dynamic routes under that placeholder (see
  // generateStaticParams in /my-shops/[id]/page.tsx etc.).
  //   /my-shops/123                  -> /my-shops/_
  //   /my-shops/123/services         -> /my-shops/_/services
  //   /my-shops/1/staff/2/hours      -> /my-shops/_/staff/_/hours
  //   /my-shops/new                  -> /my-shops/new   (not numeric, stays)
  var normalized = trimmed.replace(/\/[0-9]+(?=\/|$)/g, "/_");
  req.uri = normalized + ".html";
  return req;
}
// ---------------------------------------------------------------------------

const REWRITE = "rewrite";       // expect a rewrite to a real file
const PASSTHROUGH = "passthru";  // expect uri unchanged

const cases = [
  // Root
  ["/",                                            REWRITE,     "/index.html"],

  // Static top-level pages
  ["/shops",                                       REWRITE,     "/shops.html"],
  ["/shops/",                                      REWRITE,     "/shops.html"],
  ["/services",                                    REWRITE,     "/services.html"],
  ["/login",                                       REWRITE,     "/login.html"],
  ["/register",                                    REWRITE,     "/register.html"],
  ["/profile",                                     REWRITE,     "/profile.html"],
  ["/profile/edit",                                REWRITE,     "/profile/edit.html"],
  ["/profile/bookings",                            REWRITE,     "/profile/bookings.html"],
  ["/notifications",                               REWRITE,     "/notifications.html"],
  ["/reservations",                                REWRITE,     "/reservations.html"],
  ["/my-shops",                                    REWRITE,     "/my-shops.html"],
  ["/my-shops/new",                                REWRITE,     "/my-shops/new.html"],
  ["/verify-otp",                                  REWRITE,     "/verify-otp.html"],

  // Dynamic single-segment IDs
  ["/my-shops/1",                                  REWRITE,     "/my-shops/_.html"],
  ["/my-shops/42",                                 REWRITE,     "/my-shops/_.html"],
  ["/shops/5",                                     REWRITE,     "/shops/_.html"],

  // Dynamic ID + static child segment
  ["/my-shops/1/services",                         REWRITE,     "/my-shops/_/services.html"],
  ["/my-shops/1/edit",                             REWRITE,     "/my-shops/_/edit.html"],
  ["/my-shops/1/hours",                            REWRITE,     "/my-shops/_/hours.html"],
  ["/my-shops/1/photos",                           REWRITE,     "/my-shops/_/photos.html"],
  ["/my-shops/1/staff",                            REWRITE,     "/my-shops/_/staff.html"],
  ["/my-shops/1/analytics",                        REWRITE,     "/my-shops/_/analytics.html"],
  ["/my-shops/1/reservations",                     REWRITE,     "/my-shops/_/reservations.html"],
  ["/my-shops/1/reminders",                        REWRITE,     "/my-shops/_/reminders.html"],
  ["/my-shops/1/overrides",                        REWRITE,     "/my-shops/_/overrides.html"],
  ["/my-shops/1/walk-in",                          REWRITE,     "/my-shops/_/walk-in.html"],
  ["/my-shops/1/services/new",                     REWRITE,     "/my-shops/_/services/new.html"],
  ["/shops/5/book",                                REWRITE,     "/shops/_/book.html"],

  // Nested dynamic — TWO numeric segments
  ["/my-shops/1/staff/2/hours",                    REWRITE,     "/my-shops/_/staff/_/hours.html"],
  ["/my-shops/1/services/3/edit",                  REWRITE,     "/my-shops/_/services/_/edit.html"],
  ["/reservations/7/reschedule",                   REWRITE,     "/reservations/_/reschedule.html"],
  ["/reservations/7/review",                       REWRITE,     "/reservations/_/review.html"],

  // Pass-through: already a file
  ["/_next/static/chunks/4bd1b696.js",             PASSTHROUGH, "/_next/static/chunks/4bd1b696.js"],
  ["/favicon.ico",                                 PASSTHROUGH, "/favicon.ico"],
  ["/logo.png",                                    PASSTHROUGH, "/logo.png"],

  // Pass-through: API + WebSocket routes go to ALB
  ["/api/auth/me/",                                PASSTHROUGH, "/api/auth/me/"],
  ["/api/shops/123/",                              PASSTHROUGH, "/api/shops/123/"],
  ["/ws/chat/",                                    PASSTHROUGH, "/ws/chat/"],
];

let passed = 0;
let failed = 0;
const failures = [];

for (const [input, kind, expected] of cases) {
  const event = { request: { uri: input } };
  const result = handler(event);
  const actual = result.uri;

  const rewriteOk = actual === expected;
  // For REWRITE cases, also check that the produced file exists in the static export.
  const fileOk = kind !== REWRITE || existsSync(resolve(outDir, expected.replace(/^\//, "")));

  if (rewriteOk && fileOk) {
    passed++;
  } else {
    failed++;
    failures.push({ input, kind, expected, actual, rewriteOk, fileOk });
  }
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`\nRewrite tests: ${passed}/${cases.length} passed\n`);
if (failed > 0) {
  console.log("Failures:");
  for (const f of failures) {
    const reason = !f.rewriteOk
      ? `wrong output (got ${f.actual})`
      : `output OK but file missing in frontend/out: ${f.expected}`;
    console.log(`  ${pad(f.input, 38)} -> ${pad(f.actual, 42)}  [${reason}]`);
  }
  process.exit(1);
}
