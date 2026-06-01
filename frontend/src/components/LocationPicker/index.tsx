"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Crosshair, LocateFixed, MapPin } from "lucide-react";

/**
 * Interactive location picker used by the shop owner's edit form.
 *
 * - Renders an OSM-tiled Leaflet map with a draggable marker; clicking the
 *   map also moves the pin.
 * - Reverse-geocodes the current pin via Nominatim and shows the result in
 *   the "Pinned location" overlay card.
 * - "Use pinned location" applies the pin's coords (and Nominatim's resolved
 *   address fields, when available) back into the form.
 * - "Locate me" centers on the browser's geolocation result.
 *
 * The Leaflet map is dynamically imported with `ssr: false` because Leaflet
 * touches `window` on load.
 */

const LeafletMap = dynamic(() => import("./LeafletMap"), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

const NOMINATIM_REVERSE = "https://nominatim.openstreetmap.org/reverse";

/** Default center when the shop has no coords yet — central PH. */
const DEFAULT_CENTER = { lat: 12.8797, lng: 121.774 };

export type GeocodedAddress = {
  address_line: string;
  address_line_2?: string;
  city?: string;
  state_province?: string;
  barangay?: string;
  postal_code?: string;
  country?: string;
};

export type PinResult = {
  lat: number;
  lng: number;
  /** Resolved address fields from Nominatim, when available. */
  address?: GeocodedAddress;
  /** Human-readable label suitable for display. */
  display_name?: string;
};

type NominatimReverse = {
  display_name?: string;
  address?: {
    house_number?: string;
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    village?: string;
    town?: string;
    city?: string;
    municipality?: string;
    county?: string;
    state?: string;
    region?: string;
    postcode?: string;
    country?: string;
  };
};

async function reverseGeocode(lat: number, lng: number): Promise<PinResult> {
  const url = `${NOMINATIM_REVERSE}?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    return { lat, lng };
  }
  const data: NominatimReverse = await res.json();
  const a = data.address ?? {};
  const street = [a.house_number, a.road].filter(Boolean).join(" ").trim();
  const barangay = a.neighbourhood || a.suburb || a.village;
  const city = a.city || a.town || a.municipality || a.county;
  return {
    lat,
    lng,
    display_name: data.display_name,
    address: {
      address_line: street,
      barangay: barangay || undefined,
      city: city || undefined,
      state_province: a.state || a.region || undefined,
      postal_code: a.postcode || undefined,
      country: a.country || undefined,
    },
  };
}

export function LocationPicker({
  lat,
  lng,
  onApplyPin,
  className,
}: {
  /** Current latitude as stored in the form (string for round-tripping with text inputs). */
  lat: string;
  /** Current longitude as stored in the form. */
  lng: string;
  /** Called when the user clicks "Use pinned location". Receives the pin's
   * coords and (when Nominatim resolved them) suggested address fields. */
  onApplyPin: (result: PinResult) => void;
  className?: string;
}) {
  const numericLat = Number(lat);
  const numericLng = Number(lng);
  const hasCoords =
    lat !== "" &&
    lng !== "" &&
    Number.isFinite(numericLat) &&
    Number.isFinite(numericLng);

  // Pin state lives in the picker; it's seeded from props but mutates
  // independently as the user drags/clicks. "Use pinned location" promotes
  // it back into the form.
  const [pin, setPin] = useState<{ lat: number; lng: number }>(() =>
    hasCoords
      ? { lat: numericLat, lng: numericLng }
      : { lat: DEFAULT_CENTER.lat, lng: DEFAULT_CENTER.lng }
  );
  // Force the leaflet map to recenter when the parent updates coords (e.g.
  // address-driven geocode). We don't sync on every internal drag — that
  // would fight the user.
  const [recenterKey, setRecenterKey] = useState("init");
  const [resolved, setResolved] = useState<PinResult | null>(null);
  const [resolving, setResolving] = useState(false);
  const [locating, setLocating] = useState(false);

  // Sync from external coord changes (parent setting lat/lng from address
  // geocode, for instance). Comparing rounded values avoids feedback loops.
  useEffect(() => {
    if (!hasCoords) return;
    const dx = Math.abs(numericLat - pin.lat) + Math.abs(numericLng - pin.lng);
    if (dx > 0.00001) {
      setPin({ lat: numericLat, lng: numericLng });
      setRecenterKey(`${numericLat},${numericLng}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numericLat, numericLng, hasCoords]);

  // Reverse-geocode the pin whenever it moves (debounced). Used for the
  // overlay card and as the source for "Use pinned location".
  useEffect(() => {
    let cancelled = false;
    setResolving(true);
    const timer = window.setTimeout(async () => {
      try {
        const result = await reverseGeocode(pin.lat, pin.lng);
        if (!cancelled) setResolved(result);
      } catch {
        if (!cancelled) setResolved({ lat: pin.lat, lng: pin.lng });
      } finally {
        if (!cancelled) setResolving(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pin.lat, pin.lng]);

  const handlePinChange = useCallback((lat: number, lng: number) => {
    setPin({ lat, lng });
  }, []);

  function locateMe() {
    if (!("geolocation" in navigator)) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setRecenterKey(`me-${Date.now()}`);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  function applyPin() {
    onApplyPin(resolved ?? { lat: pin.lat, lng: pin.lng });
  }

  const overlayAddress = useMemo(() => {
    if (!resolved?.display_name) return null;
    const lines = resolved.display_name.split(", ");
    // Show up to first 3 segments — keeps the card compact.
    return lines.slice(0, 3).join(", ");
  }, [resolved]);

  return (
    <div className={className}>
      <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
        <div className="aspect-[4/3] w-full sm:aspect-[5/4]">
          <LeafletMap
            lat={pin.lat}
            lng={pin.lng}
            recenterKey={recenterKey}
            onChange={handlePinChange}
          />
        </div>

        {/* Pinned location overlay — top-left of the map. */}
        <div className="pointer-events-none absolute inset-x-3 top-3 sm:max-w-[60%]">
          <div className="pointer-events-auto flex items-start gap-2 rounded-lg bg-white/95 p-2.5 text-xs shadow ring-1 ring-slate-200 backdrop-blur">
            <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-600">
              <MapPin size={14} />
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-slate-900">Pinned location</p>
              <p className="mt-0.5 truncate text-slate-700">
                {resolving
                  ? "Looking up address…"
                  : overlayAddress || "Drag the pin or click the map"}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}
              </p>
            </div>
          </div>
        </div>

        {/* Geolocate button — bottom-right of the map, above zoom controls. */}
        <button
          type="button"
          onClick={locateMe}
          aria-label="Use my current location"
          disabled={locating}
          className="absolute bottom-3 right-3 z-[400] inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
        >
          {locating ? (
            <Crosshair size={16} className="animate-spin" />
          ) : (
            <LocateFixed size={16} />
          )}
        </button>
      </div>

      <button
        type="button"
        onClick={applyPin}
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-100"
      >
        <MapPin size={15} />
        Use pinned location
      </button>
      <p className="mt-2 text-xs text-slate-500">
        Use the map pin to set or update coordinates above.
      </p>
    </div>
  );
}

function MapSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-400">
      <span className="text-xs">Loading map…</span>
    </div>
  );
}
