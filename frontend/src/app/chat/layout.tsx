"use client";

import { usePathname } from "next/navigation";
import { ChatSidebar } from "@/components/ChatSidebar";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";
  const inRoom = /^\/chat\/[^/]+/.test(pathname);

  return (
    <div className="-mx-4 -my-6 flex h-[calc(100vh-3.75rem)] overflow-hidden border-y border-slate-200 bg-white sm:-mx-6 lg:-mx-8">
      <aside
        className={`${
          inRoom ? "hidden md:flex" : "flex"
        } w-full flex-col md:w-80 md:border-r md:border-slate-200 lg:w-96`}
      >
        <ChatSidebar />
      </aside>
      <main
        className={`${inRoom ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}
      >
        {children}
      </main>
    </div>
  );
}
