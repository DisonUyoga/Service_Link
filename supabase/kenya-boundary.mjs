/** Plain ESM copy of web/src/lib/geo/kenya.ts for Node cleanup scripts. */
export const KENYA_POLYGON = [
  [33.95, -0.95],
  [34.05, 1.0],
  [34.55, 3.55],
  [35.3, 4.75],
  [36.5, 4.65],
  [38.0, 3.9],
  [39.6, 3.45],
  [40.95, 2.45],
  [41.85, 1.15],
  [41.9, -0.85],
  [41.55, -1.7],
  [41.2, -2.1],
  [40.75, -2.4],
  [40.4, -3.2],
  [39.7, -4.0],
  [39.35, -4.7],
  [38.6, -4.65],
  [37.6, -3.9],
  [36.8, -3.35],
  [36.0, -2.9],
  [35.1, -2.2],
  [34.5, -1.55],
  [34.05, -1.1],
  [33.95, -0.95],
];

export function pointInPolygon(point, polygon) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function isValidCoord(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  return Number.isFinite(la) && Number.isFinite(ln) && Math.abs(la) <= 90 && Math.abs(ln) <= 180;
}

export function classifyKenyaCoords(input) {
  const reasons = [];
  let baseOutside = false;
  let currentOutside = false;
  let hasAny = false;

  if (isValidCoord(input.base_lat, input.base_lng)) {
    hasAny = true;
    if (!pointInPolygon([Number(input.base_lng), Number(input.base_lat)], KENYA_POLYGON)) {
      baseOutside = true;
      reasons.push("base_outside_kenya");
    }
  }

  if (isValidCoord(input.current_lat, input.current_lng)) {
    hasAny = true;
    if (!pointInPolygon([Number(input.current_lng), Number(input.current_lat)], KENYA_POLYGON)) {
      currentOutside = true;
      reasons.push("current_outside_kenya");
    }
  }

  return {
    has_any_coords: hasAny,
    base_outside: baseOutside,
    current_outside: currentOutside,
    outside_kenya: baseOutside || currentOutside,
    missing_coords: !hasAny,
    reasons,
  };
}
