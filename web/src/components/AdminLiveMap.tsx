"use client";

import { useEffect, useMemo, useState } from "react";
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map,
  useMap,
} from "@vis.gl/react-google-maps";

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
  providers: LiveProvider[];
  customerJobs: CustomerJobLocation[];
};

type SelectedMarker =
  | { type: "provider"; item: LiveProvider }
  | { type: "customer"; item: CustomerJobLocation }
  | null;

function FitAllMarkers({
  providers,
  customerJobs,
}: Pick<Props, "providers" | "customerJobs">) {
  const map = useMap();

  useEffect(() => {
    if (!map || !window.google?.maps) return;
    const points = [
      ...providers.flatMap((provider) => [
        { lat: provider.lat, lng: provider.lng },
        ...(provider.latestLocation
          ? [{ lat: provider.latestLocation.lat, lng: provider.latestLocation.lng }]
          : []),
      ]),
      ...customerJobs.map((job) => ({ lat: job.lat, lng: job.lng })),
    ];
    if (points.length === 0) return;

    if (points.length === 1) {
      map.setCenter(points[0]);
      map.setZoom(14);
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    points.forEach((point) => bounds.extend(point));
    map.fitBounds(bounds, 72);
  }, [map, providers, customerJobs]);

  return null;
}

function Pin({ label, color }: { label: string; color: string }) {
  return (
    <div
      className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow-lg"
      style={{ backgroundColor: color }}
    >
      {label}
    </div>
  );
}

function MapContents({ providers, customerJobs }: Props) {
  const [selected, setSelected] = useState<SelectedMarker>(null);

  return (
    <Map
      defaultCenter={{ lat: -1.286389, lng: 36.817223 }}
      defaultZoom={13}
      gestureHandling="greedy"
      mapId="DEMO_MAP_ID"
      style={{ width: "100%", height: "100%" }}
    >
      <FitAllMarkers providers={providers} customerJobs={customerJobs} />

      {providers.map((provider) => {
        const point = provider.latestLocation ?? provider;
        return (
          <AdvancedMarker
            key={`provider-${provider.id}`}
            position={{ lat: point.lat, lng: point.lng }}
            title={`${provider.name} — ${provider.status}`}
            onClick={() => setSelected({ type: "provider", item: provider })}
          >
            <Pin label="P" color="#0b70b7" />
          </AdvancedMarker>
        );
      })}

      {customerJobs.map((job) => (
        <AdvancedMarker
          key={`customer-job-${job.id}`}
          position={{ lat: job.lat, lng: job.lng }}
          title={`Customer job #${job.id}`}
          onClick={() => setSelected({ type: "customer", item: job })}
        >
          <Pin label="C" color="#dc2626" />
        </AdvancedMarker>
      ))}

      {selected?.type === "provider" && (
        <InfoWindow
          position={{
            lat: selected.item.latestLocation?.lat ?? selected.item.lat,
            lng: selected.item.latestLocation?.lng ?? selected.item.lng,
          }}
          onCloseClick={() => setSelected(null)}
        >
          <div className="min-w-44 p-1 text-sm text-slate-800">
            <p className="font-semibold">{selected.item.name}</p>
            <p className="text-xs text-slate-500">Provider · {selected.item.status}</p>
            <p className="mt-1 text-xs">
              {selected.item.latestLocation ? "Live job location" : "Last known service location"}
            </p>
          </div>
        </InfoWindow>
      )}

      {selected?.type === "customer" && (
        <InfoWindow
          position={{ lat: selected.item.lat, lng: selected.item.lng }}
          onCloseClick={() => setSelected(null)}
        >
          <div className="min-w-44 p-1 text-sm text-slate-800">
            <p className="font-semibold">Customer job #{selected.item.id}</p>
            <p className="text-xs text-slate-500">{selected.item.status}</p>
            <p className="mt-1 text-xs">{selected.item.description}</p>
            {selected.item.address && <p className="mt-1 text-xs">{selected.item.address}</p>}
          </div>
        </InfoWindow>
      )}
    </Map>
  );
}

export function AdminLiveMap({ providers, customerJobs }: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const markerCount = providers.length + customerJobs.length;
  const fallback = useMemo(
    () =>
      markerCount === 0
        ? "No provider or customer job locations have been reported yet."
        : "Google Maps is not configured.",
    [markerCount],
  );

  if (!apiKey) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-100 text-sm text-slate-600">
        {fallback}
      </div>
    );
  }

  return (
    <APIProvider apiKey={apiKey}>
      <MapContents providers={providers} customerJobs={customerJobs} />
    </APIProvider>
  );
}
