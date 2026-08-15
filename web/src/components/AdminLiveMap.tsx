"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  APIProvider,
  InfoWindow,
  Map,
  Marker,
  useMap,
} from "@vis.gl/react-google-maps";

export type LiveMapLayer = "providers" | "jobs";

export type LiveProvider = {
  id: number;
  name: string;
  lat: number;
  lng: number;
  status: string;
  latestLocation?: { lat: number; lng: number; recordedAt?: string };
};

export type CustomerJobLocation = {
  id: number;
  description: string;
  status: string;
  lat: number;
  lng: number;
  address?: string;
};

type Props = {
  layer?: LiveMapLayer;
  providers: LiveProvider[];
  customerJobs: CustomerJobLocation[];
};

type SelectedMarker =
  | { type: "provider"; item: LiveProvider }
  | { type: "customer"; item: CustomerJobLocation }
  | null;

/** Hide Google POIs so app markers dominate the map. */
const CLEAN_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "poi.attraction", stylers: [{ visibility: "off" }] },
  { featureType: "poi.medical", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "transit.station", stylers: [{ visibility: "off" }] },
  {
    featureType: "administrative.land_parcel",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "road",
    elementType: "labels.icon",
    stylers: [{ visibility: "off" }],
  },
];

function svgMarkerDataUrl(kind: "provider" | "job") {
  // Teardrop pins — teal providers / orange jobs (not Google POI red/blue).
  const fill = kind === "provider" ? "#0F766E" : "#C2410C";
  const glyph =
    kind === "provider"
      ? // wrench
        `<path fill="#fff" d="M26.5 11.2a5.2 5.2 0 0 0-7.1 0l-1.1 1.1 2.2 2.2.9-.9a2.1 2.1 0 0 1 3 0l.9.9-6.4 6.4-.9-.9a2.1 2.1 0 0 1 0-3l.9-.9-2.2-2.2-1.1 1.1a5.2 5.2 0 0 0 0 7.1l.4.4-4.6 4.6a1.6 1.6 0 0 0 2.3 2.3l4.6-4.6.4.4a5.2 5.2 0 0 0 7.1 0l1.1-1.1-2.2-2.2-.9.9a2.1 2.1 0 0 1-3 0l-.9-.9 6.4-6.4.9.9a2.1 2.1 0 0 1 0 3l-.9.9 2.2 2.2 1.1-1.1a5.2 5.2 0 0 0 0-7.1z"/>`
      : // house
        `<path fill="#fff" d="M22 10.5 12.5 18v12.5h6.2V23h6.6v7.5h6.2V18L22 10.5z"/>`;

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="44" height="56" viewBox="0 0 44 56">
  <defs>
    <filter id="s" x="-30%" y="-10%" width="160%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="2.2" flood-color="#0f172a" flood-opacity="0.4"/>
    </filter>
  </defs>
  <path filter="url(#s)" fill="${fill}" stroke="#ffffff" stroke-width="3.5"
    d="M22 2C12.6 2 5 9.6 5 19c0 12.4 17 33 17 33s17-20.6 17-33C39 9.6 31.4 2 22 2z"/>
  ${glyph}
</svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function FitAllMarkers({
  providers,
  customerJobs,
  layer,
}: Pick<Props, "providers" | "customerJobs" | "layer">) {
  const map = useMap();
  const fittedKeyRef = useRef<string>("");

  useEffect(() => {
    if (!map || !window.google?.maps) return;
    const points =
      layer === "jobs"
        ? customerJobs.map((job) => ({ lat: job.lat, lng: job.lng }))
        : providers.flatMap((provider) => [
            { lat: provider.lat, lng: provider.lng },
            ...(provider.latestLocation
              ? [{ lat: provider.latestLocation.lat, lng: provider.latestLocation.lng }]
              : []),
          ]);

    const fitKey = `${layer}:${points.map((p) => `${p.lat},${p.lng}`).join("|")}`;
    if (points.length === 0) return;
    if (fittedKeyRef.current === fitKey) return;
    fittedKeyRef.current = fitKey;

    if (points.length === 1) {
      map.setCenter(points[0]);
      map.setZoom(14);
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    points.forEach((point) => bounds.extend(point));
    map.fitBounds(bounds, 72);
  }, [map, providers, customerJobs, layer]);

  return null;
}

function MapContents({ providers, customerJobs, layer = "providers" }: Props) {
  const [selected, setSelected] = useState<SelectedMarker>(null);
  const providerIcon = useMemo(
    () => ({
      url: svgMarkerDataUrl("provider"),
      scaledSize: { width: 44, height: 56 } as google.maps.Size,
      anchor: { x: 22, y: 54 } as google.maps.Point,
    }),
    [],
  );
  const jobIcon = useMemo(
    () => ({
      url: svgMarkerDataUrl("job"),
      scaledSize: { width: 44, height: 56 } as google.maps.Size,
      anchor: { x: 22, y: 54 } as google.maps.Point,
    }),
    [],
  );

  // Clear selection when switching layers.
  useEffect(() => {
    setSelected(null);
  }, [layer]);

  const showProviders = layer === "providers";
  const showJobs = layer === "jobs";

  return (
    <Map
      defaultCenter={{ lat: -1.286389, lng: 36.817223 }}
      defaultZoom={13}
      gestureHandling="greedy"
      disableDefaultUI={false}
      styles={CLEAN_MAP_STYLES}
      style={{ width: "100%", height: "100%" }}
    >
      <FitAllMarkers providers={providers} customerJobs={customerJobs} layer={layer} />

      {showProviders &&
        providers.map((provider) => {
          const point = provider.latestLocation ?? provider;
          return (
            <Marker
              key={`provider-${provider.id}`}
              position={{ lat: point.lat, lng: point.lng }}
              title={`${provider.name} — ${provider.status}`}
              icon={providerIcon}
              zIndex={20}
              onClick={() => setSelected({ type: "provider", item: provider })}
            />
          );
        })}

      {showJobs &&
        customerJobs.map((job) => (
          <Marker
            key={`customer-job-${job.id}`}
            position={{ lat: job.lat, lng: job.lng }}
            title={`Customer job #${job.id}`}
            icon={jobIcon}
            zIndex={30}
            onClick={() => setSelected({ type: "customer", item: job })}
          />
        ))}

      {selected?.type === "provider" && showProviders && (
        <InfoWindow
          position={{
            lat: selected.item.latestLocation?.lat ?? selected.item.lat,
            lng: selected.item.latestLocation?.lng ?? selected.item.lng,
          }}
          onCloseClick={() => setSelected(null)}
        >
          <div className="min-w-44 p-1 text-sm text-slate-800">
            <p className="font-semibold">{selected.item.name}</p>
            <p className="text-xs text-teal-700">Provider · {selected.item.status}</p>
            <p className="mt-1 text-xs">
              {selected.item.latestLocation ? "Live GPS position" : "Base / last known location"}
            </p>
          </div>
        </InfoWindow>
      )}

      {selected?.type === "customer" && showJobs && (
        <InfoWindow
          position={{ lat: selected.item.lat, lng: selected.item.lng }}
          onCloseClick={() => setSelected(null)}
        >
          <div className="min-w-44 p-1 text-sm text-slate-800">
            <p className="font-semibold">Customer job #{selected.item.id}</p>
            <p className="text-xs text-orange-700">{selected.item.status}</p>
            <p className="mt-1 text-xs">{selected.item.description}</p>
            {selected.item.address && <p className="mt-1 text-xs">{selected.item.address}</p>}
          </div>
        </InfoWindow>
      )}
    </Map>
  );
}

export function AdminLiveMap({ layer = "providers", providers, customerJobs }: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const markerCount =
    layer === "jobs" ? customerJobs.length : providers.length;
  const emptyMessage =
    layer === "jobs"
      ? "No customer job pins to show yet."
      : "No provider locations have been reported yet.";
  const waitingMessage =
    layer === "jobs"
      ? "Waiting for customer job locations…"
      : "Waiting for provider locations…";

  if (!apiKey) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-100 to-slate-200 px-6 text-center text-sm text-slate-600">
        <p className="font-medium text-slate-800">
          {markerCount === 0 ? emptyMessage : "Google Maps is not configured."}
        </p>
        <p className="max-w-md text-xs text-slate-500">
          Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to render the live operations map.
        </p>
      </div>
    );
  }

  if (markerCount === 0) {
    return (
      <div className="relative h-full">
        <APIProvider apiKey={apiKey}>
          <Map
            defaultCenter={{ lat: -1.286389, lng: 36.817223 }}
            defaultZoom={11}
            gestureHandling="greedy"
            styles={CLEAN_MAP_STYLES}
            style={{ width: "100%", height: "100%" }}
          />
        </APIProvider>
        <div className="pointer-events-none absolute inset-x-0 bottom-4 mx-auto w-fit rounded-full bg-white/95 px-4 py-2 text-xs text-slate-600 shadow">
          {waitingMessage}
        </div>
      </div>
    );
  }

  return (
    <APIProvider apiKey={apiKey}>
      <MapContents layer={layer} providers={providers} customerJobs={customerJobs} />
    </APIProvider>
  );
}
