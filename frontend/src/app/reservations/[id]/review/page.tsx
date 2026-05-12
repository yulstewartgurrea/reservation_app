"use client";

import { FormEvent, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/errors";

export default function LeaveReviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post("/reviews/", {
        reservation: Number(id),
        rating,
        comment,
      });
      router.push("/reservations");
    } catch (err) {
      setError(formatApiError(err, "Failed to submit."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-md py-6">
      <h1 className="text-2xl font-semibold">Leave a review</h1>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label className="block text-sm font-medium">Rating</label>
          <div className="mt-1 flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                className={`text-2xl ${n <= rating ? "text-amber-500" : "text-slate-300"}`}
                aria-label={`${n} stars`}
              >
                ★
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium">Comment (optional)</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-md bg-brand-600 px-4 py-2 text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? "Submitting…" : "Submit review"}
        </button>
      </form>
    </div>
  );
}
