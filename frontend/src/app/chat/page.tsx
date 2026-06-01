"use client";

import { MessageSquare } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function ChatLandingPage() {
  const { user } = useAuth();

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="rounded-md border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          Please sign in to view your chats.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-slate-50 px-6 py-12 text-center">
      <div>
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-brand-600">
          <MessageSquare size={28} />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-slate-900">
          Select a conversation
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {user.role === "shop_owner"
            ? "Choose a customer from the list to view their messages."
            : "Choose a shop from the list to continue the conversation."}
        </p>
      </div>
    </div>
  );
}
