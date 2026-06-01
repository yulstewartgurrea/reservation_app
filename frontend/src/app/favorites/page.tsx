"use client";

import { useRouter } from "next/navigation";
import { FavoritesPanel } from "@/app/profile/_components/FavoritesPanel";

// Standalone "Favorites" route. Kept for external bookmarks; the in-profile
// experience lives at `/profile/favorites` via the shared <FavoritesPanel />.
export default function FavoritesPage() {
  const router = useRouter();
  return <FavoritesPanel onBack={() => router.back()} />;
}
