"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useUrlParams } from "@/lib/useUrlParams";
import {
  Calendar as CalendarIcon,
  ChevronDown,
  Clock,
  CreditCard,
  Layers,
  Lock,
  MapPin,
  Minus,
  Pencil,
  Plus,
  Shield,
  Store,
  Tag,
  User,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/errors";
import { formatPhp, todayIso } from "@/lib/format";

type Staff = { id: number; name: string; is_active: boolean };
type Slot = { start_at: string; end_at: string };
type WorkingHours = {
  weekday: number;
  is_off: boolean;
  start_time: string | null;
  end_time: string | null;
};

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function summarizeHours(rows: WorkingHours[]): string {
  const working = rows
    .filter((r) => !r.is_off && r.start_time && r.end_time)
    .sort((a, b) => a.weekday - b.weekday);
  if (working.length === 0) return "No working hours set — not bookable.";
  const hm = (t: string) => t.slice(0, 5);
  const sameRange = working.every(
    (r) => r.start_time === working[0].start_time && r.end_time === working[0].end_time
  );
  const days = working.map((r) => DAY_NAMES[r.weekday]).join(", ");
  if (sameRange) {
    return `Works ${days} · ${hm(working[0].start_time!)}–${hm(working[0].end_time!)}`;
  }
  return working
    .map((r) => `${DAY_NAMES[r.weekday]} ${hm(r.start_time!)}–${hm(r.end_time!)}`)
    .join(" · ");
}
type Service = {
  id: number;
  shop: number;
  name: string;
  description: string;
  duration_minutes: number;
  price: string;
  cover_photo: string | null;
  max_quantity: number;
  unit_label: string;
  inter_unit_buffer_minutes: number;
};

/**
 * Mirrors the server's reservation duration: each unit takes
 * `duration_minutes`, with `inter_unit_buffer_minutes` inserted between
 * consecutive units. At N=1 this reduces to `duration_minutes` (no gaps).
 */
function reservedMinutes(svc: Service, qty: number): number {
  const n = Math.max(1, qty);
  return (
    svc.duration_minutes * n +
    (svc.inter_unit_buffer_minutes ?? 0) * (n - 1)
  );
}

/** Naive pluralization: "unit" → "units" when qty != 1. */
function unitText(qty: number, unitLabel: string): string {
  const label = unitLabel?.trim() || "unit";
  return `${qty} ${qty === 1 ? label : `${label}s`}`;
}

type Shop = { id: number; name: string; city: string; country: string };

const NOTES_MAX = 250;
const SUMMARY_DATE_OPTS: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
};

function BookPageInner() {
  const params = useUrlParams<{ id: string }>("/shops/[id]/book");
  const search = useSearchParams();
  const router = useRouter();
  const serviceId = search.get("service");

  const [staff, setStaff] = useState<Staff[]>([]);
  const [staffId, setStaffId] = useState<string>(""); // "" = any
  const [quantity, setQuantity] = useState(1);
  const [date, setDate] = useState(() => todayIso());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"pay_on_arrival" | "online">(
    "pay_on_arrival"
  );
  const [notes, setNotes] = useState("");
  const [shop, setShop] = useState<Shop | null>(null);
  const [service, setService] = useState<Service | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staffHours, setStaffHours] = useState<WorkingHours[] | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!params.id) return;
    api
      .get("/shops/staff/", { params: { shop: params.id } })
      .then((r) => {
        const list: Staff[] = r.data.results ?? r.data;
        setStaff(list.filter((s) => s.is_active));
      });
    api.get(`/shops/${params.id}/`).then((r) => setShop(r.data));
  }, [params.id]);

  useEffect(() => {
    if (!serviceId) return;
    api.get(`/services/${serviceId}/`).then((r) => {
      setService(r.data);
      // Reset quantity for the newly-loaded service.
      setQuantity(1);
      setChosen(null);
    });
  }, [serviceId]);

  useEffect(() => {
    if (!params.id || !serviceId) return;
    setLoadingSlots(true);
    api
      .get("/reservations/availability/", {
        params: {
          shop: params.id,
          service: serviceId,
          staff: staffId || undefined,
          date,
          quantity,
        },
      })
      .then((r) => setSlots(r.data))
      .finally(() => setLoadingSlots(false));
  }, [params.id, serviceId, date, staffId, quantity, refreshKey]);

  useEffect(() => {
    if (!staffId) {
      setStaffHours(null);
      return;
    }
    api
      .get(`/shops/staff/${staffId}/hours/`)
      .then((r) => setStaffHours(r.data))
      .catch(() => setStaffHours(null));
  }, [staffId]);

  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    []
  );

  const maxQuantity = service?.max_quantity ?? 1;
  const showQuantity = maxQuantity > 1;

  function changeQuantity(next: number) {
    const clamped = Math.min(Math.max(next, 1), maxQuantity);
    setQuantity(clamped);
    // The chosen slot may no longer fit the longer block — drop it and let
    // availability refetch with the new quantity.
    setChosen(null);
  }

  async function book() {
    if (!chosen || !serviceId) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data: reservation } = await api.post("/reservations/book/", {
        shop: Number(params.id),
        service: Number(serviceId),
        staff: staffId ? Number(staffId) : null,
        start_at: chosen,
        quantity,
        payment_method: paymentMethod,
        customer_notes: notes,
      });
      if (paymentMethod === "online") {
        const { data: pay } = await api.post(
          `/payments/reservations/${reservation.id}/checkout/`
        );
        if (pay.checkout_url) {
          window.location.href = pay.checkout_url;
          return;
        }
      }
      router.push("/reservations");
    } catch (err) {
      setError(formatApiError(err));
      // The slot may have just been taken (esp. with "Any available", where
      // the server auto-assigns). Drop the selection and refetch availability.
      setChosen(null);
      setRefreshKey((k) => k + 1);
    } finally {
      setSubmitting(false);
    }
  }

  if (!serviceId) {
    return <p className="py-6 text-sm text-slate-500">Pick a service first.</p>;
  }

  const chosenStaffLabel =
    staffId === ""
      ? "No preference"
      : staff.find((s) => String(s.id) === staffId)?.name ?? "No preference";

  return (
    <div className="space-y-5 py-4">
      <StepIndicator />

      <div className="grid gap-5 lg:grid-cols-3">
        {/* MAIN FORM (2/3) */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-2">
          <header>
            <h1 className="text-2xl font-semibold text-slate-900">Book your service</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Pick a date and time, then choose how to pay. Requesting a staff
              member is optional.
            </p>
          </header>

          {/* Staff + Date */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Field icon={User} label="Staff (optional)">
              <div className="relative">
                <Users
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <select
                  value={staffId}
                  onChange={(e) => {
                    setStaffId(e.target.value);
                    setChosen(null);
                  }}
                  className="w-full appearance-none rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-9 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">No preference</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={16}
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
              </div>
            </Field>

            <Field icon={CalendarIcon} label="Date">
              <div className="relative">
                <CalendarIcon
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="date"
                  value={date}
                  min={todayIso()}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setChosen(null);
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </Field>
          </div>

          {showQuantity && (
            <>
              <Divider />
              <section>
                <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Layers size={16} className="text-brand-600" />
                  How many {service ? `${service.unit_label?.trim() || "unit"}s` : "units"}?
                </h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  Book up to {unitText(maxQuantity, service?.unit_label ?? "unit")} in
                  one reservation. Time and price scale with the quantity.
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <div className="inline-flex items-stretch overflow-hidden rounded-lg border border-slate-300">
                    <button
                      type="button"
                      aria-label="Decrease quantity"
                      onClick={() => changeQuantity(quantity - 1)}
                      disabled={quantity <= 1}
                      className="flex h-11 w-11 items-center justify-center text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Minus size={16} />
                    </button>
                    <span
                      aria-live="polite"
                      className="flex h-11 min-w-[3rem] items-center justify-center border-x border-slate-300 px-3 text-base font-semibold text-slate-900"
                    >
                      {quantity}
                    </span>
                    <button
                      type="button"
                      aria-label="Increase quantity"
                      onClick={() => changeQuantity(quantity + 1)}
                      disabled={quantity >= maxQuantity}
                      className="flex h-11 w-11 items-center justify-center text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <span className="text-sm text-slate-500">
                    {unitText(quantity, service?.unit_label ?? "unit")}
                  </span>
                </div>
              </section>
            </>
          )}

          <Divider />

          {/* Available times */}
          <section>
            <div className="flex items-center justify-between">
              <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Clock size={16} className="text-brand-600" />
                Available times
              </h2>
              <span className="text-xs text-slate-500">Timezone: {timezone}</span>
            </div>
            {staffId === "" ? (
              <p className="mt-1 text-xs text-slate-500">
                Times reflect the shop&apos;s available capacity.
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-500">
                A requested staff member is a preference, not a guarantee — the
                shop confirms who serves you.
                {staffHours && ` ${summarizeHours(staffHours)}`}
              </p>
            )}
            <div className="mt-3">
              {loadingSlots ? (
                <p className="text-sm text-slate-500">Loading slots…</p>
              ) : slots.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                  No slots available on that day.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {slots.map((s) => {
                    const active = chosen === s.start_at;
                    return (
                      <button
                        key={s.start_at}
                        onClick={() => setChosen(s.start_at)}
                        className={`rounded-lg border px-2 py-2.5 text-sm font-medium transition ${
                          active
                            ? "border-brand-600 bg-brand-50 text-brand-700"
                            : "border-slate-200 bg-white text-slate-700 hover:border-brand-400"
                        }`}
                      >
                        {new Date(s.start_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <Divider />

          {/* Payment method */}
          <section>
            <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
              <CreditCard size={16} className="text-brand-600" />
              Payment method
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Choose how you&apos;d like to pay for your booking.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <PaymentOption
                active={paymentMethod === "pay_on_arrival"}
                icon={Store}
                title="Pay on arrival"
                description="Pay in person at the time of your appointment."
                badge="Recommended"
                onClick={() => setPaymentMethod("pay_on_arrival")}
              />
              {/* PayMongo online payment temporarily disabled
              <PaymentOption
                active={paymentMethod === "online"}
                icon={CreditCard}
                title="Pay now (PayMongo)"
                description="Securely pay online now via PayMongo (GCash, GrabPay, Maya, cards, etc.)."
                onClick={() => setPaymentMethod("online")}
              />
              */}
            </div>
          </section>

          <Divider />

          {/* Notes */}
          <section>
            <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Pencil size={16} className="text-brand-600" />
              Notes <span className="font-normal text-slate-500">(optional)</span>
            </h2>
            <div className="relative mt-2">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, NOTES_MAX))}
                rows={3}
                placeholder="Add any notes or special requests for your appointment…"
                className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <span className="pointer-events-none absolute bottom-2 right-3 text-xs text-slate-400">
                {notes.length}/{NOTES_MAX}
              </span>
            </div>
          </section>

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

          {/* Submit row */}
          <div className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <Shield size={14} className="text-emerald-500" />
              Your booking is secure and your information is protected.
            </p>
            <button
              disabled={!chosen || submitting}
              onClick={book}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Lock size={16} />
              {submitting
                ? paymentMethod === "online"
                  ? "Redirecting to PayMongo…"
                  : "Booking…"
                : "Confirm booking"}
            </button>
          </div>
        </section>

        {/* SUMMARY (1/3) */}
        <aside className="lg:sticky lg:top-4 lg:col-span-1 lg:self-start">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="aspect-[4/3] w-full overflow-hidden bg-slate-100">
              {service?.cover_photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={service.cover_photo}
                  alt={service.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-slate-300">
                  <CalendarIcon size={48} />
                </div>
              )}
            </div>
            <div className="space-y-5 p-5">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  {service?.name ?? "—"}
                </h3>
                {shop && (
                  <Link
                    href={`/shops/${shop.id}`}
                    className="text-sm text-brand-600 hover:underline"
                  >
                    {shop.name}
                  </Link>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <ServiceFact
                  icon={Tag}
                  value={
                    service
                      ? formatPhp(Number(service.price) * quantity)
                      : "—"
                  }
                  label="Price"
                />
                <ServiceFact
                  icon={Clock}
                  value={
                    service
                      ? `${reservedMinutes(service, quantity)} min`
                      : "—"
                  }
                  label="Duration"
                />
                <ServiceFact
                  icon={MapPin}
                  value={shop?.city ?? "—"}
                  label="Location"
                />
              </div>

              {service?.description && (
                <p className="text-sm text-slate-600">{service.description}</p>
              )}

              <div className="border-t border-slate-100 pt-4">
                <h4 className="text-sm font-semibold text-slate-900">
                  Your booking summary
                </h4>
                <dl className="mt-3 space-y-2 text-sm">
                  <SummaryRow
                    icon={CalendarIcon}
                    label="Date"
                    value={new Date(date).toLocaleDateString([], SUMMARY_DATE_OPTS)}
                  />
                  <SummaryRow
                    icon={Clock}
                    label="Time"
                    value={
                      chosen
                        ? new Date(chosen).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Not selected"
                    }
                  />
                  <SummaryRow icon={User} label="Staff" value={chosenStaffLabel} />
                  {showQuantity && (
                    <SummaryRow
                      icon={Layers}
                      label="Quantity"
                      value={unitText(
                        quantity,
                        service?.unit_label ?? "unit"
                      )}
                    />
                  )}
                  <SummaryRow
                    icon={CreditCard}
                    label="Payment"
                    value={
                      <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                        {paymentMethod === "pay_on_arrival"
                          ? "Pay on arrival"
                          : "Pay now"}
                      </span>
                    }
                  />
                </dl>
              </div>

              <div className="border-t border-dashed border-slate-200 pt-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-base font-semibold text-slate-900">Total</span>
                  <span className="text-2xl font-semibold text-slate-900">
                    {service
                      ? formatPhp(Number(service.price) * quantity)
                      : "—"}
                  </span>
                </div>
                {showQuantity && service && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatPhp(Number(service.price))} ×{" "}
                    {unitText(quantity, service.unit_label)} ·{" "}
                    {reservedMinutes(service, quantity)} min total
                  </p>
                )}
                <p className="mt-0.5 text-xs text-slate-500">
                  Final price &amp; time are confirmed on booking.
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function StepIndicator() {
  return (
    <nav className="flex items-center justify-center gap-2 sm:gap-4">
      <Step number={1} label="Service" state="complete" />
      <Separator />
      <Step number={2} label="Schedule & Payment" state="active" />
      <Separator />
      <Step number={3} label="Confirm" state="todo" />
    </nav>
  );
}

function Step({
  number,
  label,
  state,
}: {
  number: number;
  label: string;
  state: "complete" | "active" | "todo";
}) {
  const dotClass =
    state === "complete"
      ? "bg-emerald-500 text-white"
      : state === "active"
        ? "bg-brand-600 text-white"
        : "bg-slate-200 text-slate-500";
  const labelClass =
    state === "todo" ? "text-slate-400" : "font-medium text-slate-700";
  return (
    <div className="inline-flex items-center gap-2">
      <span
        className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${dotClass}`}
      >
        {state === "complete" ? "✓" : number}
      </span>
      <span className={`text-sm ${labelClass}`}>{label}</span>
    </div>
  );
}

function Separator() {
  return <span className="hidden h-px w-6 bg-slate-200 sm:inline-block" aria-hidden />;
}

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof User;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 inline-flex items-center gap-1.5 text-sm font-medium text-slate-700">
        <Icon size={14} className="text-brand-600" />
        {label}
      </label>
      {children}
    </div>
  );
}

function Divider() {
  return <div className="my-6 border-t border-slate-100" />;
}

function PaymentOption({
  active,
  icon: Icon,
  title,
  description,
  badge,
  onClick,
}: {
  active: boolean;
  icon: typeof Store;
  title: string;
  description: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-lg border-2 p-4 text-left transition ${
        active
          ? "border-brand-600 bg-brand-50/40"
          : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <span
        className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border ${
          active ? "border-brand-600" : "border-slate-300"
        }`}
      >
        {active && <span className="h-2.5 w-2.5 rounded-full bg-brand-600" />}
      </span>
      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
        <Icon size={20} />
      </span>
      <span className="flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold text-slate-900">{title}</span>
          {badge && (
            <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
              {badge}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-sm text-slate-600">{description}</span>
      </span>
    </button>
  );
}

function ServiceFact({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Tag;
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-2">
      <Icon size={14} className="mx-auto text-brand-600" />
      <div className="mt-1 truncate text-sm font-semibold text-slate-900">
        {value}
      </div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function SummaryRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarIcon;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="inline-flex items-center gap-2 text-slate-500">
        <Icon size={14} className="text-slate-400" />
        {label}
      </dt>
      <dd className="text-right text-slate-900">{value}</dd>
    </div>
  );
}

export default function BookPage() {
  return (
    <Suspense fallback={<p className="py-6 text-sm text-slate-500">Loading…</p>}>
      <BookPageInner />
    </Suspense>
  );
}
