"use client";

/**
 * Leaflet-based interactive map used by the shop owner location picker.
 *
 * Touches `window`/`document` on import, so the parent loads it via
 * `next/dynamic({ ssr: false })`. Default marker icons are patched here once,
 * since Leaflet's defaults assume image paths Next.js doesn't ship.
 */

import { useEffect, useMemo } from "react";
import L from "leaflet";
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// Patch Leaflet's default icon to use the bundled PNGs (Next/Webpack returns
// objects with `.src`, not strings). Runs once on first import.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })
  ._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: (markerIcon as unknown as { src: string }).src,
  iconRetinaUrl: (markerIcon2x as unknown as { src: string }).src,
  shadowUrl: (markerShadow as unknown as { src: string }).src,
});

export type LeafletMapProps = {
  lat: number;
  lng: number;
  zoom?: number;
  onChange: (lat: number, lng: number) => void;
  /** When `lat`/`lng` change to a non-trivial delta, recenter the view. */
  recenterKey: string;
};

export default function LeafletMap({
  lat,
  lng,
  zoom = 15,
  onChange,
  recenterKey,
}: LeafletMapProps) {
  const center = useMemo<[number, number]>(() => [lat, lng], [lat, lng]);

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      scrollWheelZoom
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <DraggableMarker lat={lat} lng={lng} onChange={onChange} />
      <ClickToMove onChange={onChange} />
      <RecenterOnChange lat={lat} lng={lng} recenterKey={recenterKey} />
    </MapContainer>
  );
}

function DraggableMarker({
  lat,
  lng,
  onChange,
}: {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
}) {
  return (
    <Marker
      position={[lat, lng]}
      draggable
      eventHandlers={{
        dragend(e) {
          const { lat: newLat, lng: newLng } = e.target.getLatLng();
          onChange(newLat, newLng);
        },
      }}
    />
  );
}

function ClickToMove({
  onChange,
}: {
  onChange: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function RecenterOnChange({
  lat,
  lng,
  recenterKey,
}: {
  lat: number;
  lng: number;
  recenterKey: string;
}) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom(), { animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterKey]);
  return null;
}
