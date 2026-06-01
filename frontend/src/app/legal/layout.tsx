import Link from "next/link";

/**
 * Shared layout for /legal/* pages.
 *
 * Provides a sidebar of policy links on desktop and a top "Back to BookMe"
 * link. The article uses scoped `[&_h2]` / `[&_p]` selectors so individual
 * policy pages can stay as plain semantic HTML without per-element classes.
 */

const links = [
  { href: "/legal/privacy", label: "Privacy Policy" },
  { href: "/legal/terms", label: "Terms of Service" },
  { href: "/legal/refund", label: "Refund & Cancellation" },
];

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-8 lg:grid-cols-[220px,1fr]">
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <Link
          href="/shops"
          className="mb-4 inline-block text-sm text-brand-700 hover:underline"
        >
          ← Back to BookMe
        </Link>
        <nav className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </aside>
      <article
        className="
          max-w-3xl text-slate-700
          [&_h1]:mb-2 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:text-slate-900
          [&_h2]:mb-3 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-slate-900
          [&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-slate-900
          [&_p]:mb-4 [&_p]:leading-relaxed
          [&_ul]:mb-4 [&_ul]:ml-6 [&_ul]:list-disc [&_ul]:space-y-1
          [&_ol]:mb-4 [&_ol]:ml-6 [&_ol]:list-decimal [&_ol]:space-y-1
          [&_a]:text-brand-700 [&_a]:underline hover:[&_a]:text-brand-800
          [&_strong]:font-semibold [&_strong]:text-slate-900
        "
      >
        {children}
      </article>
    </div>
  );
}
