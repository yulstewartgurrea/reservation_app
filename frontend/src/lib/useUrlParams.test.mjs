/**
 * Tests for parseUrlParams — covers every dynamic-route pattern this app
 * actually uses, against realistic URL values.
 *
 * Run from repo root:
 *   node frontend/src/lib/useUrlParams.test.mjs
 *
 * (Mirrors the implementation in useUrlParams.ts — keep in sync if either changes.)
 */

function parseUrlParams(pattern, pathname) {
  const patternSegs = pattern.split("/").filter(Boolean);
  const urlSegs = pathname.split("/").filter(Boolean);
  const out = {};
  patternSegs.forEach((seg, i) => {
    if (seg.startsWith("[") && seg.endsWith("]")) {
      out[seg.slice(1, -1)] = urlSegs[i] ?? "";
    }
  });
  return out;
}

const cases = [
  // /shops/[id]
  ["/shops/[id]",                              "/shops/5",                            { id: "5" }],
  ["/shops/[id]",                              "/shops/42",                           { id: "42" }],
  ["/shops/[id]/book",                         "/shops/5/book",                       { id: "5" }],

  // /my-shops/[id] and children
  ["/my-shops/[id]",                           "/my-shops/2",                         { id: "2" }],
  ["/my-shops/[id]/edit",                      "/my-shops/2/edit",                    { id: "2" }],
  ["/my-shops/[id]/hours",                     "/my-shops/2/hours",                   { id: "2" }],
  ["/my-shops/[id]/services",                  "/my-shops/2/services",                { id: "2" }],
  ["/my-shops/[id]/services/new",              "/my-shops/2/services/new",            { id: "2" }],
  ["/my-shops/[id]/staff",                     "/my-shops/2/staff",                   { id: "2" }],
  ["/my-shops/[id]/photos",                    "/my-shops/2/photos",                  { id: "2" }],
  ["/my-shops/[id]/analytics",                 "/my-shops/2/analytics",               { id: "2" }],
  ["/my-shops/[id]/reservations",              "/my-shops/2/reservations",            { id: "2" }],
  ["/my-shops/[id]/reminders",                 "/my-shops/2/reminders",               { id: "2" }],
  ["/my-shops/[id]/overrides",                 "/my-shops/2/overrides",               { id: "2" }],
  ["/my-shops/[id]/walk-in",                   "/my-shops/2/walk-in",                 { id: "2" }],

  // Nested dynamic — two `[name]` segments
  ["/my-shops/[id]/staff/[staffId]/hours",     "/my-shops/2/staff/3/hours",           { id: "2", staffId: "3" }],
  ["/my-shops/[id]/services/[serviceId]/edit", "/my-shops/2/services/3/edit",         { id: "2", serviceId: "3" }],

  // /reservations/[id]/*
  ["/reservations/[id]/reschedule",            "/reservations/7/reschedule",          { id: "7" }],
  ["/reservations/[id]/review",                "/reservations/7/review",              { id: "7" }],

  // /chat/[roomId]
  ["/chat/[roomId]",                           "/chat/abc-123",                       { roomId: "abc-123" }],

  // First-render shape: pattern with no matching URL yet returns empty strings
  ["/my-shops/[id]",                           "",                                    { id: "" }],
  ["/my-shops/[id]/staff/[staffId]/hours",     "/",                                   { id: "", staffId: "" }],

  // Pattern segments without `[name]` are ignored — only dynamic ones land in the result
  ["/my-shops/new",                            "/my-shops/new",                       {}],
];

let pass = 0;
let fail = 0;
const failures = [];

for (const [pattern, url, expected] of cases) {
  const actual = parseUrlParams(pattern, url);
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
  } else {
    fail++;
    failures.push({ pattern, url, expected, actual });
  }
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`\nparseUrlParams: ${pass}/${cases.length} passed\n`);
if (fail > 0) {
  console.log("Failures:");
  for (const f of failures) {
    console.log(`  pattern: ${pad(f.pattern, 44)}`);
    console.log(`  url:     ${f.url}`);
    console.log(`  expect:  ${JSON.stringify(f.expected)}`);
    console.log(`  got:     ${JSON.stringify(f.actual)}`);
    console.log("");
  }
  process.exit(1);
}
