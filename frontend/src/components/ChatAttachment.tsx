"use client";

import { FileText, Download } from "lucide-react";
import { absUrl, type ChatAttachmentKind } from "@/lib/ws";

function formatBytes(n: number | null | undefined): string {
  if (!n || n <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v.toFixed(v >= 10 || u === 0 ? 0 : 1)} ${units[u]}`;
}

export function ChatAttachment({
  url,
  kind,
  name,
  size,
  mine,
}: {
  url: string;
  kind: ChatAttachmentKind | null;
  name: string | null;
  size: number | null;
  mine: boolean;
}) {
  const href = absUrl(url) ?? url;
  const display = name || (kind ? `${kind}` : "attachment");

  if (kind === "image") {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={href}
          alt={display}
          className="max-h-72 max-w-full rounded-lg object-cover"
        />
      </a>
    );
  }

  if (kind === "video") {
    return (
      <video
        src={href}
        controls
        preload="metadata"
        className="max-h-72 w-full max-w-full rounded-lg bg-black"
      />
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      download={name || true}
      className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
        mine
          ? "border-white/30 bg-white/10 text-white hover:bg-white/20"
          : "border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100"
      }`}
    >
      <FileText
        size={20}
        className={mine ? "text-white/80" : "text-slate-500"}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{display}</p>
        {size ? (
          <p className={`text-xs ${mine ? "text-white/70" : "text-slate-500"}`}>
            {formatBytes(size)}
          </p>
        ) : null}
      </div>
      <Download size={16} className={mine ? "text-white/80" : "text-slate-500"} />
    </a>
  );
}
