import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { TopNav } from "@/components/TopNav";
import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";

export const metadata: Metadata = {
  title: "Reserva — Book services nearby",
  description: "Find and book services from local shops.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Reserva",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#4f46e5",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50">
        <Providers>
          <TopNav />
          <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
          <RegisterServiceWorker />
        </Providers>
      </body>
    </html>
  );
}
