// Servizio di routing reale (percorso su strada, non linea dritta),
// tramite OSRM (Open Source Routing Machine) — coerente con la scelta
// già fatta per la mappa stessa (Leaflet + OpenStreetMap), gratuito e
// senza bisogno di una chiave API a pagamento come Google Directions.

export interface RouteResult {
  coords: [number, number][]; // [lat, lng] points following real roads
  distanceMeters: number;
  durationSeconds: number;
}

export async function fetchRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  profile: "driving" | "walking" | "cycling" = "driving"
): Promise<RouteResult | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/${profile}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route) return null;

    const coords: [number, number][] = route.geometry.coordinates.map(
      ([lng, lat]: [number, number]) => [lat, lng]
    );

    return {
      coords,
      distanceMeters: route.distance,
      durationSeconds: route.duration,
    };
  } catch {
    // OSRM's public demo server has no uptime guarantee — fail
    // gracefully so the app can fall back to "open external maps app"
    // instead of breaking navigation entirely.
    return null;
  }
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours}h ${rest}min`;
}
