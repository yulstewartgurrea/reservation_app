"use client";

import { useState } from "react";
import { Crosshair, MapPin } from "lucide-react";

/**
 * Free, keyless location preview + geocode helper used by the shop owner forms.
 *
 * - Preview: an OpenStreetMap iframe centered on (lat, lng) with a marker.
 *   No API key or JS dependency — just an iframe pointed at osm.org's embed
 *   endpoint.
 * - Geocode: Nominatim (OSM's free geocoder) is called from the browser to
 *   turn an address into lat/lng. Nominatim's usage policy requires low
 *   request rates and a descriptive User-Agent / Referer; browser fetches
 *   automatically send the Referer, and this UI only fires on a user click.
 *
 * Pair this with manual lat/lng overrides in an "Advanced" section so owners
 * can fine-tune if geocoding got it wrong.
 */

export type GeocodeInput = {
  address_line: string;
  city: string;
  postal_code?: string;
  country: string;
};

export type LatLng = { lat: number; lng: number };

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

/** Builds a comma-joined query string from the address fields. */
function buildQuery(input: GeocodeInput): string {
  return [input.address_line, input.city, input.postal_code, input.country]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(", ");
}

export async function geocodeAddress(
  input: GeocodeInput
): Promise<LatLng | null> {
  const q = buildQuery(input);
  if (!q) return null;
  const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
  const rows: { lat: string; lon: string }[] = await res.json();
  if (!rows.length) return null;
  return { lat: Number(rows[0].lat), lng: Number(rows[0].lon) };
}

/** OSM embed URL with a marker. Bbox is a ~0.01° box around the point so the
 * default zoom is street-level. */
function osmEmbedUrl(lat: number, lng: number): string {
  const d = 0.005;
  const bbox = [lng - d, lat - d, lng + d, lat + d].join("%2C");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
}

export function LocationMap({
  lat,
  lng,
  onUseAddress,
  canGeocode,
  className,
}: {
  lat: string;
  lng: string;
  /** Click handler that should geocode the current address fields and update
   * the lat/lng inputs. Disabled until `canGeocode` is true. */
  onUseAddress: () => Promise<void>;
  canGeocode: boolean;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const numericLat = Number(lat);
  const numericLng = Number(lng);
  const hasPin =
    lat !== "" &&
    lng !== "" &&
    Number.isFinite(numericLat) &&
    Number.isFinite(numericLng);

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      await onUseAddress();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not look up that address."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`overflow-hidden rounded-lg border border-slate-200 bg-white ${className ?? ""}`}
    >
      <div className="relative aspect-[4/3] w-full bg-slate-100">
        {hasPin ? (
          <iframe
            title="Map preview"
            src={osmEmbedUrl(numericLat, numericLng)}
            className="h-full w-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        ) : (
          <Placeholder />
        )}
      </div>

      <div className="space-y-2 border-t border-slate-100 p-3">
        <button
          type="button"
          onClick={handleClick}
          disabled={!canGeocode || busy}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Crosshair size={14} />
          {busy ? "Looking up address…" : "Use address coordinates"}
        </button>
        <p
          className={`flex items-center gap-1.5 text-xs ${
            hasPin ? "text-emerald-700" : "text-slate-500"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              hasPin ? "bg-emerald-500" : "bg-slate-300"
            }`}
          />
          {hasPin
            ? `Pinned at ${numericLat.toFixed(4)}, ${numericLng.toFixed(4)}`
            : "Click “Use address coordinates” to drop a pin"}
        </p>
        {error && <p className="text-xs text-rose-600">{error}</p>}
      </div>
    </div>
  );
}

function Placeholder() {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{
        backgroundImage:
          "linear-gradient(135deg, rgb(241 245 249) 25%, transparent 25%), linear-gradient(225deg, rgb(241 245 249) 25%, transparent 25%), linear-gradient(45deg, rgb(241 245 249) 25%, transparent 25%), linear-gradient(315deg, rgb(241 245 249) 25%, rgb(248 250 252) 25%)",
        backgroundPosition: "10px 0, 10px 0, 0 0, 0 0",
        backgroundSize: "20px 20px",
      }}
    >
      <MapPin size={32} className="text-slate-300" strokeWidth={2.25} />
    </div>
  );
}
