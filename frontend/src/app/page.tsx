"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * Root route.
 *
 * Handles CloudFront SPA fallback for non-root routes.
 *
 * When S3 404s on a deep route (e.g.
 *     /my-shops/123 — no flat .html exists because dynamic routes
 *     export only `_` placeholders), CloudFront serves this page's
 *     /index.html with the original URL still in the address bar.
 *     We tell the App Router to navigate to that URL so Next.js
 *     resolves and renders the matching route. Without this, the home
 *     page would incorrectly render for deep links.
 *
 * The redirect runs in useEffect — NOT via the server-component
 * `redirect()` helper — because that helper bakes a
 * <meta http-equiv="refresh"> into the static export, which fires
 * before hydration and clobbers fallback resolution before
 * the client router can look at the URL.
 */
const categories = [
  { name: "Hair salons", icon: "💇" },
  { name: "Nail studios", icon: "💅" },
  { name: "Massage", icon: "💆" },
  { name: "Spa", icon: "🧖" },
  { name: "Barbers", icon: "✂️" },
  { name: "Car wash", icon: "🚗" },
  { name: "Repair", icon: "🛠️" },
  { name: "Dental", icon: "🦷" },
];

const featuredDestinations = [
  {
    title: "BGC, Taguig",
    subtitle: "Premium wellness and beauty spots",
    image:
      "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1200&q=80",
  },
  {
    title: "Makati",
    subtitle: "Fast bookings around business districts",
    image:
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1200&q=80",
  },
  {
    title: "Quezon City",
    subtitle: "Budget-friendly service picks",
    image:
      "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=1200&q=80",
  },
  {
    title: "Cebu City",
    subtitle: "Top-rated shops near you",
    image:
      "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=1200&q=80",
  },
];

const featuredStays = [
  {
    title: "Glow Lounge",
    location: "Makati",
    distance: "5 km away",
    price: "from PHP 850",
    image:
      "https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1200&q=80",
  },
  {
    title: "The Daily Barber",
    location: "BGC",
    distance: "3 km away",
    price: "from PHP 420",
    image:
      "https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&w=1200&q=80",
  },
  {
    title: "Serenity Spa",
    location: "Quezon City",
    distance: "8 km away",
    price: "from PHP 1,100",
    image:
      "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=1200&q=80",
  },
  {
    title: "QuickFix Auto Care",
    location: "Pasig",
    distance: "7 km away",
    price: "from PHP 650",
    image:
      "https://images.unsplash.com/photo-1607860108855-64acf2078ed9?auto=format&fit=crop&w=1200&q=80",
  },
];

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const target = window.location.pathname + window.location.search;
    if (target !== "/") {
      router.replace(target);
    }
  }, [router]);

  return (
    <div className="space-y-10 pb-12">
      <section className="sticky top-3 z-20 rounded-full border border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 rounded-full border border-slate-200 px-4 py-2 shadow-sm">
            <span className="text-sm font-semibold text-slate-800">Anywhere</span>
            <span className="h-4 w-px bg-slate-200" />
            <span className="text-sm font-semibold text-slate-800">Any service</span>
            <span className="h-4 w-px bg-slate-200" />
            <span className="text-sm text-slate-500">Add date</span>
          </div>
          <Link
            href="/shops"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-lg text-white transition hover:bg-brand-700"
            aria-label="Search shops"
          >
            🔍
          </Link>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl bg-gradient-to-r from-brand-700 via-brand-600 to-brand-500 px-6 py-12 text-white sm:px-10 sm:py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-brand-100">BookMe</p>
        <h1 className="mt-4 max-w-3xl text-3xl font-semibold leading-tight sm:text-5xl">
          Book services with an Airbnb-style experience.
        </h1>
        <p className="mt-4 max-w-2xl text-base text-brand-50 sm:text-lg">
          Browse nearby salons, spas, clinics, and auto shops with fast booking and clear pricing.
        </p>
        <div className="mt-8 grid gap-3 rounded-2xl bg-white p-3 text-slate-900 shadow-2xl sm:grid-cols-[1.3fr_1fr_1fr_auto]">
          <button type="button" className="rounded-xl px-4 py-3 text-left transition hover:bg-slate-50">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Where</p>
            <p className="mt-1 text-sm font-medium">Metro Manila</p>
          </button>
          <button type="button" className="rounded-xl px-4 py-3 text-left transition hover:bg-slate-50">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Service</p>
            <p className="mt-1 text-sm font-medium">Haircut, massage...</p>
          </button>
          <button type="button" className="rounded-xl px-4 py-3 text-left transition hover:bg-slate-50">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">When</p>
            <p className="mt-1 text-sm font-medium">Add date</p>
          </button>
          <Link
            href="/shops"
            className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            Search
          </Link>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">Popular categories</h2>
          <Link href="/services" className="text-sm font-semibold text-slate-600 hover:text-slate-900">
            Show all
          </Link>
        </div>
        <div className="-mx-2 flex gap-3 overflow-x-auto px-2 pb-1">
          {categories.map((category) => (
            <button
              key={category.name}
              type="button"
              className="inline-flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:shadow-sm"
            >
              <span>{category.icon}</span>
              <span>{category.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">Inspiration for your next booking</h2>
          <Link href="/shops" className="text-sm font-semibold text-brand-600 hover:text-brand-700">
            Explore all
          </Link>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {featuredDestinations.map((item) => (
            <article
              key={item.title}
              className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <img src={item.image} alt={item.title} className="h-44 w-full object-cover" loading="lazy" />
              <div className="space-y-1 p-4">
                <h3 className="text-base font-semibold text-slate-900">{item.title}</h3>
                <p className="text-sm text-slate-600">{item.subtitle}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">Available this week</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {featuredStays.map((item) => (
            <article key={item.title} className="space-y-3">
              <div className="overflow-hidden rounded-2xl">
                <img src={item.image} alt={item.title} className="h-56 w-full object-cover transition hover:scale-105" loading="lazy" />
              </div>
              <div className="space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>
                  <span className="text-sm text-slate-700">★ 4.9</span>
                </div>
                <p className="text-sm text-slate-500">
                  {item.location} · {item.distance}
                </p>
                <p className="text-sm font-semibold text-slate-900">{item.price}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-3xl bg-slate-900 px-6 py-8 text-white sm:px-10">
        <h2 className="text-2xl font-semibold">List your shop on BookMe</h2>
        <p className="mt-2 max-w-xl text-sm text-slate-200 sm:text-base">
          Join local businesses already growing with online reservations, reminders, and reviews.
        </p>
        <Link
          href="/register"
          className="mt-5 inline-flex rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
        >
          Get started
        </Link>
      </section>
    </div>
  );
}
