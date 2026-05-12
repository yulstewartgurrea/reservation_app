"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  Heart,
  Mail,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  Settings,
  Star,
} from "lucide-react";
import { formatApiError } from "@/lib/errors";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatHours, WeekdayHoursRow } from "@/lib/format";
import { PublicServiceCard } from "@/components/PublicServiceCard";

type Shop = {
  id: number;
  owner: number;
  name: string;
  description: string;
  address_line: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  status: "active" | "paused" | "pending";
  cancellation_window_hours: number | null;
  photos: { id: number; image: string; caption: string }[];
  weekday_hours: WeekdayHoursRow[];
  services_count: number;
  reviews_count: number;
  total_bookings: number | null;
};

type Service = {
  id: number;
  name: string;
  description: string;
  duration_minutes: number;
  price: string;
  cover_photo: string | null;
  category_detail?: { id: number; name: string } | null;
};

type Review = {
  id: number;
  customer_name: string;
  rating: number;
  comment: string;
  shop_reply: string;
  created_at: string;
};

export default function ShopDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [shop, setShop] = useState<Shop | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [favoriteId, setFavoriteId] = useState<number | null>(null);
  const [chatBusy, setChatBusy] = useState(false);

  async function openChat() {
    if (!shop || chatBusy) return;
    if (!user) {
      router.push("/login");
      return;
    }
    setChatBusy(true);
    try {
      const { data } = await api.post("/chat/rooms/", { shop: shop.id });
      router.push(`/chat/${data.id}`);
    } catch (err) {
      alert(formatApiError(err, "Could not open chat."));
      setChatBusy(false);
    }
  }

  useEffect(() => {
    api.get(`/shops/${params.id}/`).then((r) => setShop(r.data));
    api
      .get(`/services/`, { params: { shop: params.id } })
      .then((r) => setServices(r.data.results ?? r.data));
    api
      .get(`/reviews/`, { params: { shop: params.id } })
      .then((r) => setReviews(r.data.results ?? r.data));
    if (typeof window !== "undefined" && localStorage.getItem("access_token")) {
      api
        .get(`/shops/favorites/`)
        .then((r) => {
          const list = r.data.results ?? r.data;
          const match = list.find(
            (f: { shop: number; id: number }) => f.shop === Number(params.id)
          );
          setFavoriteId(match?.id ?? null);
        })
        .catch(() => undefined);
    }
  }, [params.id]);

  async function toggleFavorite() {
    if (!shop) return;
    if (favoriteId) {
      await api.delete(`/shops/favorites/${favoriteId}/`);
      setFavoriteId(null);
    } else {
      const { data } = await api.post(`/shops/favorites/`, { shop: shop.id });
      setFavoriteId(data.id);
    }
  }

  async function reply(reviewId: number) {
    const text = prompt("Your reply:");
    if (!text) return;
    await api.post(`/reviews/${reviewId}/reply/`, { shop_reply: text });
    const r = await api.get(`/reviews/`, { params: { shop: params.id } });
    setReviews(r.data.results ?? r.data);
  }

  if (!shop) return <p className="py-8 text-sm text-slate-500">Loading…</p>;

  const isOwner = user?.id === shop.owner;
  const cover = shop.photos?.[0]?.image ?? null;
  const avgRating =
    reviews.length === 0
      ? null
      : (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1);
  const hoursLines = formatHours(shop.weekday_hours ?? []);

  return (
    <div className="space-y-6 py-4">
      <Link
        href="/shops"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft size={16} />
        Back to shops
      </Link>

      {/* HERO CARD */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="grid gap-0 md:grid-cols-[2fr_3fr]">
          {/* photo */}
          <div className="relative aspect-[4/3] w-full bg-slate-100 md:aspect-auto md:min-h-[320px]">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cover}
                alt={shop.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-300">
                <MapPin size={48} />
              </div>
            )}
            {isOwner && (
              <Link
                href={`/dashboard/shops/${shop.id}/photos`}
                className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow"
              >
                <Pencil size={12} />
                Change photo
              </Link>
            )}
          </div>

          {/* info */}
          <div className="flex flex-col gap-4 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  shop.status === "active"
                    ? "bg-emerald-50 text-emerald-700"
                    : shop.status === "paused"
                      ? "bg-amber-50 text-amber-700"
                      : "bg-slate-100 text-slate-700"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {shop.status[0].toUpperCase() + shop.status.slice(1)}
              </span>

              <div className="flex items-center gap-2">
                {user?.role === "customer" && (
                  <button
                    onClick={toggleFavorite}
                    aria-label={favoriteId ? "Remove favorite" : "Add favorite"}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
                  >
                    <Heart
                      size={14}
                      className={favoriteId ? "text-red-500" : "text-slate-500"}
                      fill={favoriteId ? "currentColor" : "none"}
                    />
                    {favoriteId ? "Saved" : "Save"}
                  </button>
                )}
                {(!user || user.role === "customer") && shop.status === "active" && (
                  <button
                    onClick={openChat}
                    disabled={chatBusy}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                  >
                    <MessageCircle size={14} className="text-slate-500" />
                    {chatBusy ? "Opening…" : "Chat"}
                  </button>
                )}
                {isOwner && (
                  <Link
                    href={`/dashboard/shops/${shop.id}`}
                    className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
                  >
                    <Settings size={14} />
                    Manage shop
                  </Link>
                )}
              </div>
            </div>

            <div>
              <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">
                {shop.name}
              </h1>
              <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-slate-600">
                <MapPin size={14} className="text-slate-400" />
                {[shop.address_line, shop.city, shop.country].filter(Boolean).join(", ")}
              </p>
            </div>

            {shop.description && (
              <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                {shop.description}
              </div>
            )}

            {/* metrics row */}
            <div className="mt-auto grid grid-cols-3 gap-3 border-t border-slate-100 pt-4">
              <Metric icon={Settings} value={shop.services_count} label="Services" />
              <Metric
                icon={Star}
                value={avgRating ? `${avgRating} ★` : shop.reviews_count}
                label="Reviews"
              />
              {isOwner && shop.total_bookings !== null ? (
                <Metric
                  icon={CalendarDays}
                  value={shop.total_bookings}
                  label="Total bookings"
                />
              ) : (
                <Metric
                  icon={Clock}
                  value={
                    shop.cancellation_window_hours !== null
                      ? `${shop.cancellation_window_hours}h`
                      : "—"
                  }
                  label="Free cancel"
                />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Services</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {isOwner
                ? "What customers can book at this shop."
                : "Pick a service to book."}
            </p>
          </div>
          {isOwner && (
            <Link
              href={`/dashboard/shops/${shop.id}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Settings size={14} />
              Manage services
            </Link>
          )}
        </div>

        {services.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">
            No services yet.
          </p>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {services.map((s) => (
              <PublicServiceCard
                key={s.id}
                hideShop
                service={{
                  id: s.id,
                  name: s.name,
                  duration_minutes: s.duration_minutes,
                  price: s.price,
                  cover_photo: s.cover_photo,
                  shop_id: shop.id,
                  shop_name: shop.name,
                  shop_city: shop.city,
                  category: s.category_detail?.name ?? null,
                }}
              />
            ))}
          </ul>
        )}
      </section>

      {/* BOTTOM ROW: business info + reviews */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-900">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-50 text-brand-600">
                <Phone size={14} />
              </span>
              Business information
            </h2>
            {isOwner && (
              <Link
                href={`/dashboard/shops/${shop.id}/edit`}
                className="rounded-md border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Edit
              </Link>
            )}
          </div>
          <dl className="space-y-3 text-sm">
            {shop.phone && (
              <InfoRow icon={Phone} value={shop.phone} />
            )}
            {shop.email && <InfoRow icon={Mail} value={shop.email} />}
            <InfoRow
              icon={Clock}
              value={
                hoursLines.length === 0 ? (
                  <span className="text-slate-500">No hours set yet.</span>
                ) : (
                  <span className="block">
                    {hoursLines.map((line) => (
                      <span key={line} className="block">
                        {line}
                      </span>
                    ))}
                  </span>
                )
              }
            />
          </dl>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-900">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-50 text-brand-600">
                <Star size={14} />
              </span>
              Reviews
            </h2>
            {avgRating && (
              <span className="text-sm text-amber-600">
                <Star size={12} className="-mt-0.5 inline" fill="currentColor" /> {avgRating}
              </span>
            )}
          </div>

          {reviews.length === 0 ? (
            <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-slate-200 bg-slate-50 py-8 text-center">
              <Star size={24} className="text-slate-300" />
              <p className="text-sm font-medium text-slate-700">No reviews yet</p>
              <p className="text-xs text-slate-500">
                Reviews from customers will appear here.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {reviews.slice(0, 3).map((rev) => (
                <li
                  key={rev.id}
                  className="rounded-lg border border-slate-100 p-3 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-900">
                      {rev.customer_name || "Customer"}
                    </span>
                    <span className="text-amber-500">
                      {"★".repeat(rev.rating)}
                    </span>
                  </div>
                  {rev.comment && (
                    <p className="mt-1.5 text-slate-700">{rev.comment}</p>
                  )}
                  {rev.shop_reply && (
                    <div className="mt-2 rounded-md bg-slate-50 p-2">
                      <div className="text-xs font-medium text-slate-500">
                        Reply from {shop.name}
                      </div>
                      <div className="mt-1 text-slate-700">{rev.shop_reply}</div>
                    </div>
                  )}
                  {isOwner && !rev.shop_reply && (
                    <button
                      onClick={() => reply(rev.id)}
                      className="mt-2 rounded-md border border-slate-300 px-3 py-1 text-xs"
                    >
                      Reply
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Metric({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Settings;
  value: number | string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-50 text-brand-600">
        <Icon size={16} />
      </span>
      <div>
        <div className="text-base font-semibold text-slate-900">{value}</div>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  value,
}: {
  icon: typeof Phone;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <Icon size={16} className="mt-0.5 flex-shrink-0 text-slate-400" />
      <div className="text-slate-700">{value}</div>
    </div>
  );
}
