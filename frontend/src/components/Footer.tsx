import Link from "next/link";

/**
 * Global footer with legal and support links.
 *
 * Rendered once in the root layout so it appears on every page. Keep this
 * lightweight — anything that needs auth/state belongs in TopNav, not here.
 */
export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-12 border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p>&copy; {year} BookMe. All rights reserved.</p>
        <nav className="flex flex-wrap gap-x-4 gap-y-2">
          <Link href="/legal/privacy" className="hover:text-slate-900">
            Privacy
          </Link>
          <Link href="/legal/terms" className="hover:text-slate-900">
            Terms
          </Link>
          <Link href="/legal/refund" className="hover:text-slate-900">
            Refunds
          </Link>
          <Link href="/support" className="hover:text-slate-900">
            Support
          </Link>
        </nav>
      </div>
    </footer>
  );
}
