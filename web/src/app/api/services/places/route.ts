import { handleApiError, json, detail } from "@/lib/api";
import { env } from "@/lib/env";

/** Google Places Autocomplete + Details proxy (Kenya-biased). */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
    if (!key) return detail("Google Maps API key not configured", 503);

    const mode = url.searchParams.get("mode") || "autocomplete";
    if (mode === "details") {
      const placeId = url.searchParams.get("place_id");
      if (!placeId) return detail("place_id required", 400);
      const endpoint = new URL("https://maps.googleapis.com/maps/api/place/details/json");
      endpoint.searchParams.set("place_id", placeId);
      endpoint.searchParams.set("fields", "place_id,formatted_address,geometry,name");
      endpoint.searchParams.set("key", key);
      const res = await fetch(endpoint.toString());
      const data = await res.json();
      const r = data.result || {};
      return json({
        place_id: r.place_id,
        formatted_address: r.formatted_address || r.name || "",
        lat: r.geometry?.location?.lat ?? null,
        lng: r.geometry?.location?.lng ?? null,
        name: r.name || "",
      });
    }

    const input = url.searchParams.get("input") || "";
    if (input.trim().length < 2) return json({ predictions: [] });
    const endpoint = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
    endpoint.searchParams.set("input", input);
    endpoint.searchParams.set("components", "country:ke");
    endpoint.searchParams.set("location", "-1.286389,36.817223");
    endpoint.searchParams.set("radius", "50000");
    endpoint.searchParams.set("key", key);
    const res = await fetch(endpoint.toString());
    const data = await res.json();
    const predictions = (data.predictions || []).map((p: any) => ({
      description: p.description,
      place_id: p.place_id,
      main_text: p.structured_formatting?.main_text || p.description,
      secondary_text: p.structured_formatting?.secondary_text || "",
    }));
    return json({ predictions, status: data.status, demo: env.demoMode });
  } catch (e) {
    return handleApiError(e);
  }
}
