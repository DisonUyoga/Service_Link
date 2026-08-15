"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  APIProvider,
  Map,
  AdvancedMarker,
  InfoWindow,
  useMap,
} from "@vis.gl/react-google-maps";

export type MapProvider = {
  id: number;
  user_name: string;
  category: string;
  tier: string;
  rating_avg: number;
  total_jobs_completed: number;
  bio?: string;
  base_lat: number | null;
  base_lng: number | null;
  distance_km?: number;
};

type Props = {
  providers: MapProvider[];
  center: { lat: number; lng: number };
  selectedId: number | null;
  onSelect: (id: number | null) => void;
};

function FitBounds({ providers }: { providers: MapProvider[] }) {
  const map = useMap();
  useEffect(() => {
    if (!map || providers.length === 0 || !window.google?.maps) return;
    const bounds = new google.maps.LatLngBounds();
    providers.forEach((p) => {
      if (p.base_lat != null && p.base_lng != null) {
        bounds.extend({ lat: p.base_lat, lng: p.base_lng });
      }
    });
    map.fitBounds(bounds, 80);
  }, [map, providers]);
  return null;
}

function MapInner({ providers, center, selectedId, onSelect }: Props) {
  const selected = providers.find((p) => p.id === selectedId) ?? null;

  return (
    <Map
      defaultCenter={center}
      defaultZoom={13}
      gestureHandling="greedy"
      disableDefaultUI={false}
      mapId="DEMO_MAP_ID"
      style={{ width: "100%", height: "100%" }}
      colorScheme="LIGHT"
    >
      <FitBounds providers={providers} />
      {providers.map((p) =>
        p.base_lat != null && p.base_lng != null ? (
          <AdvancedMarker
            key={p.id}
            position={{ lat: p.base_lat, lng: p.base_lng }}
            title={p.user_name}
            onClick={() => onSelect(p.id)}
          >
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white shadow-lg"
              style={{ background: "var(--brand)" }}
            >
              <span className="text-xs font-bold text-white">
                {p.user_name.slice(0, 1).toUpperCase()}
              </span>
            </div>
          </AdvancedMarker>
        ) : null,
      )}
      {selected && selected.base_lat != null && selected.base_lng != null && (
        <InfoWindow
          position={{ lat: selected.base_lat, lng: selected.base_lng }}
          onCloseClick={() => onSelect(null)}
        >
          <div className="min-w-[180px] p-1 text-sm text-slate-800">
            <p className="font-semibold">{selected.user_name}</p>
            <p className="text-xs text-slate-500">
              {selected.category} · {selected.tier}
            </p>
            <p className="mt-1 text-xs">
              ★ {selected.rating_avg} · {selected.total_jobs_completed} jobs
            </p>
          </div>
        </InfoWindow>
      )}
    </Map>
  );
}

export function ProvidersMap(props: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

  if (!apiKey) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-slate-100 px-6 text-center">
        <p className="text-lg font-semibold text-slate-800">Google Maps key needed</p>
        <p className="max-w-md text-sm text-slate-600">
          Add <code className="rounded bg-white px-1">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to{" "}
          <code className="rounded bg-white px-1">web/.env.local</code>, enable Maps JavaScript
          API, then restart the dev server.
        </p>
        <div className="mt-2 max-h-64 w-full max-w-lg overflow-auto rounded-xl border border-slate-200 bg-white text-left">
          {props.providers.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => props.onSelect(p.id)}
              className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-3 text-sm hover:bg-[var(--brand-light)]"
            >
              <span className="font-medium">{p.user_name}</span>
              <span className="text-xs text-slate-500">{p.category}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <APIProvider apiKey={apiKey}>
      <MapInner {...props} />
    </APIProvider>
  );
}

export function useMapCenter() {
  const defaultCenter = useMemo(() => ({ lat: -1.286389, lng: 36.817223 }), []);
  const [center, setCenter] = useState(defaultCenter);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        /* keep Nairobi default */
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, []);

  return center;
}

export function useNearbyProviders(center: { lat: number; lng: number }, token: string | null) {
  const [providers, setProviders] = useState<MapProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/services/providers/nearby/?lat=${center.lat}&lng=${center.lng}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || "Failed to load providers");
      setProviders(Array.isArray(body) ? body : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load providers");
    } finally {
      setLoading(false);
    }
  }, [center.lat, center.lng, token]);

  useEffect(() => {
    void load();
  }, [load]);

  return { providers, loading, error, reload: load };
}
