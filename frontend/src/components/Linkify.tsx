"use client";

import { Fragment } from "react";

// Matches http(s)://… and bare www.… up to the next whitespace. Conservative:
// no schemes other than http/https, no email auto-link (that's a separate UX
// decision), no domain-only detection (avoids false positives on file names).
const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<]+[^\s.,;:!?<])/gi;

export function Linkify({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const parts: Array<{ kind: "text" | "link"; value: string; href?: string }> = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text)) !== null) {
    if (m.index > lastIndex) {
      parts.push({ kind: "text", value: text.slice(lastIndex, m.index) });
    }
    const raw = m[1];
    const href = raw.startsWith("www.") ? `https://${raw}` : raw;
    parts.push({ kind: "link", value: raw, href });
    lastIndex = m.index + raw.length;
  }
  if (lastIndex < text.length) {
    parts.push({ kind: "text", value: text.slice(lastIndex) });
  }
  if (parts.length === 0) {
    return <span className={className}>{text}</span>;
  }
  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.kind === "link" ? (
          <a
            key={i}
            href={p.href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:opacity-80"
          >
            {p.value}
          </a>
        ) : (
          <Fragment key={i}>{p.value}</Fragment>
        )
      )}
    </span>
  );
}
