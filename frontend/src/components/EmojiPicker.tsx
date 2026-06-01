"use client";

import { useEffect, useRef, useState } from "react";

// Curated set — keeps the picker small and dependency-free. Add more later if
// users ask. Groups roughly mirror the standard Unicode emoji groupings.
const GROUPS: { label: string; emojis: string[] }[] = [
  {
    label: "Smileys",
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "🙂", "🙃",
      "😉", "😍", "😘", "😗", "😚", "😋", "😜", "🤪", "🤩", "🥳", "😎",
      "🤔", "😐", "😑", "😶", "🙄", "😏", "😣", "😥", "😮", "🤐", "😯",
      "😪", "😴", "😌", "😛", "🤤", "😒", "🤨", "🤓", "🥺", "😢", "😭",
      "😤", "😠", "😡", "🤯", "😳", "🥵", "🥶",
    ],
  },
  {
    label: "Gestures",
    emojis: [
      "👍", "👎", "👌", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆",
      "👇", "☝️", "✋", "🤚", "🖐️", "🖖", "👋", "🤝", "🙏", "💪", "🦾",
      "👏", "🙌", "👐", "🤲", "🤜", "🤛", "✊",
    ],
  },
  {
    label: "Hearts",
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️",
      "💕", "💞", "💓", "💗", "💖", "💘", "💝",
    ],
  },
  {
    label: "Objects",
    emojis: [
      "🔥", "✨", "🎉", "🎊", "🎁", "🎂", "🍕", "🍔", "🍣", "🍜", "🍩",
      "☕", "🍺", "🍷", "🍻", "📷", "📱", "💻", "🎮", "🎵", "🎶", "📚",
      "✈️", "🚗", "🏠", "💡", "💰", "✅", "❌", "❓", "❗",
    ],
  },
];

export function EmojiPicker({
  onPick,
  onClose,
}: {
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={rootRef}
      className="absolute bottom-full left-0 z-20 mb-2 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl"
    >
      <div className="mb-2 flex gap-1 overflow-x-auto">
        {GROUPS.map((g, i) => (
          <button
            key={g.label}
            type="button"
            onClick={() => setActive(i)}
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
              i === active
                ? "bg-brand-100 text-brand-700"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>
      <div className="grid max-h-48 grid-cols-8 gap-1 overflow-y-auto">
        {GROUPS[active].emojis.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onPick(e)}
            className="rounded-md p-1 text-xl hover:bg-slate-100"
            aria-label={`Insert ${e}`}
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
