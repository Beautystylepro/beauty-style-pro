import { useEffect, useState, useRef } from "react";
import { X, Navigation2, AlertTriangle } from "lucide-react";
import InteractiveMap from "@/components/map/InteractiveMap";
import useLiveTracking from "@/hooks/useLiveTracking";
import { fetchRoute, formatDistance, formatDuration, type RouteResult } from "@/lib/routing";

interface NavigationViewProps {
  destination: { lat: number; lng: number; label: string };
  onClose: () => void;
}

// Vera navigazione dentro l'app: posizione GPS che si aggiorna da sola
// mentre ci si muove, percorso reale su strada (non una linea dritta),
// ricalcolato periodicamente — lo stesso principio di un navigatore
// satellitare vero, senza dover uscire dall'app.
export default function NavigationView({ destination, onClose }: NavigationViewProps) {
  const { position, error: gpsError } = useLiveTracking(true);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeError, setRouteError] = useState(false);
  const [loadingRoute, setLoadingRoute] = useState(true);
  const lastRouteFetchRef = useRef<number>(0);

  useEffect(() => {
    if (!position) return;

    // Recalculate the route at most every 20 seconds — enough to follow
    // real movement without hammering the routing service on every GPS
    // tick.
    const now = Date.now();
    if (now - lastRouteFetchRef.current < 20000 && route) return;
    lastRouteFetchRef.current = now;

    (async () => {
      setLoadingRoute(true);
      const result = await fetchRoute(
        { lat: position.lat, lng: position.lng },
        { lat: destination.lat, lng: destination.lng }
      );
      if (result) {
        setRoute(result);
        setRouteError(false);
      } else {
        setRouteError(true);
      }
      setLoadingRoute(false);
    })();
  }, [position, destination, route]);

  const openExternalNav = () => {
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${destination.lat},${destination.lng}&travelmode=driving`,
      "_blank"
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="relative flex-1">
        <InteractiveMap
          center={position ? [position.lat, position.lng] : [destination.lat, destination.lng]}
          zoom={16}
          height="100%"
          showUserMarker
          routeCoords={route?.coords}
          markers={[{
            id: "dest",
            lat: destination.lat,
            lng: destination.lng,
            label: destination.label,
            type: "salon",
          }]}
        />

        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-11 h-11 rounded-full bg-background shadow-lg flex items-center justify-center z-[1000]"
          aria-label="Chiudi navigazione"
        >
          <X className="w-5 h-5" />
        </button>

        {gpsError && (
          <div className="absolute top-4 left-4 right-16 bg-destructive/90 text-destructive-foreground text-xs rounded-xl px-3 py-2 flex items-center gap-2 z-[1000]">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {gpsError}
          </div>
        )}
      </div>

      <div className="p-4 bg-card border-t border-border/50 space-y-3">
        <div className="flex items-center gap-2">
          <Navigation2 className="w-4 h-4 text-primary" />
          <p className="text-sm font-semibold truncate">{destination.label}</p>
        </div>

        {loadingRoute && !route ? (
          <p className="text-xs text-muted-foreground">Calcolo del percorso in corso...</p>
        ) : route ? (
          <div className="flex items-center gap-4">
            <div>
              <p className="text-2xl font-bold text-primary">{formatDuration(route.durationSeconds)}</p>
              <p className="text-xs text-muted-foreground">{formatDistance(route.distanceMeters)}</p>
            </div>
          </div>
        ) : routeError ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Il servizio di calcolo percorso non è al momento disponibile.
            </p>
            <button
              onClick={openExternalNav}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold"
            >
              Apri in Google Maps
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
