import Link from "next/link";

export default function HomePage() {
  return (
    <div className="space-y-10 py-8 sm:py-16">
      <section className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          Book local services in seconds
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-slate-600 sm:text-lg">
          Find haircuts, massages, car washes, and more near you. Pay on arrival.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/shops"
            className="w-full rounded-lg bg-brand-600 px-6 py-3 text-center text-white hover:bg-brand-700 sm:w-auto"
          >
            Browse shops
          </Link>
          <Link
            href="/shops?nearby=1"
            className="w-full rounded-lg border border-slate-300 bg-white px-6 py-3 text-center text-slate-700 hover:bg-slate-50 sm:w-auto"
          >
            Find shops near me
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { title: "Hair & Beauty", desc: "Haircuts, color, manicure, pedicure" },
          { title: "Wellness", desc: "Massage, spa, sauna" },
          { title: "Home & Auto", desc: "Aircon clean, car wash, repair" },
        ].map((c) => (
          <div
            key={c.title}
            className="rounded-lg border border-slate-200 bg-white p-5 text-sm shadow-sm"
          >
            <div className="font-semibold text-slate-900">{c.title}</div>
            <div className="mt-1 text-slate-600">{c.desc}</div>
          </div>
        ))}
      </section>
    </div>
  );
}
