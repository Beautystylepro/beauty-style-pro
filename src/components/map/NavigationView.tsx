import { useEffect, useState, useRef } from "react";
import { X, Navigation2, AlertTriangle, Search } from "lucide-react";
import InteractiveMap from "@/components/map/InteractiveMap";
import useLiveTracking from "@/hooks/useLiveTracking";
import { fetchRoute, formatDistance, formatDuration, geocodeAddress, type RouteResult, type GeocodeResult } from "@/lib/routing";

interface NavigationViewProps {
  destination?: { lat: number; lng: number; label: string } | null;
  startCenter: { lat: number; lng: number };
  onClose: () => void;
}

// Vera navigazione dentro l'app: posizione GPS che si aggiorna da sola
// mentre ci si muove, percorso reale su strada (non una linea dritta),
// ricalcolato periodicamente — lo stesso principio di un navigatore
// satellitare vero, senza dover uscire dall'app.
export default function NavigationView({ destination: initialDestination, startCenter, onClose }: NavigationViewProps) {
  const [destination, setDestination] = useState(initialDestination || null);
  const { position, error: gpsError } = useLiveTracking(true);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeError, setRouteError] = useState(false);
  const [loadingRoute, setLoadingRoute] = useState(!!initialDestination);
  const lastRouteFetchRef = useRef<number>(0);

  // Ricerca di un indirizzo qualsiasi, non solo destinazioni già
  // registrate — permette di navigare verso QUALSIASI via/numero reale,
  // anche senza aver prima toccato un professionista sulla mappa.
  const [addressQuery, setAddressQuery] = useState("");
  const [addressResults, setAddressResults] = useState<GeocodeResult[]>([]);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [showAddressSearch, setShowAddressSearch] = useState(!initialDestination);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleAddressInput = (value: string) => {
    setAddressQuery(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (value.trim().length < 3) {
      setAddressResults([]);
      return;
    }
    searchDebounceRef.current = setTimeout(async () => {
      setSearchingAddress(true);
      const results = await geocodeAddress(value);
      setAddressResults(results);
      setSearchingAddress(false);
    }, 500);
  };

  const selectAddressResult = (result: GeocodeResult) => {
    setDestination({ lat: result.lat, lng: result.lng, label: result.label });
    setRoute(null);
    lastRouteFetchRef.current = 0;
    setShowAddressSearch(false);
    setAddressQuery("");
    setAddressResults([]);
  };

  useEffect(() => {
    if (!position || !destination) return;

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
    if (!destination) return;
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${destination.lat},${destination.lng}&travelmode=driving`,
      "_blank"
    );
  };

  const mapCenter: [number, number] = position
    ? [position.lat, position.lng]
    : destination
      ? [destination.lat, destination.lng]
      : [startCenter.lat, startCenter.lng];

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="relative flex-1">
        <InteractiveMap
          center={mapCenter}
          zoom={16}
          height="100%"
          showUserMarker
          routeCoords={route?.coords}
          markers={destination ? [{
            id: "dest",
            lat: destination.lat,
            lng: destination.lng,
            label: destination.label,
            type: "salon",
          }] : []}
        />

        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-11 h-11 rounded-full bg-background shadow-lg flex items-center justify-center z-[1000]"
          aria-label="Chiudi navigazione"
        >
          <X className="w-5 h-5" />
        </button>

        <button
          onClick={() => setShowAddressSearch(v => !v)}
          className="absolute top-4 left-4 right-16 h-11 rounded-full bg-background shadow-lg flex items-center gap-2 px-4 text-sm text-muted-foreground z-[1000]"
          aria-label="Cerca un altro indirizzo"
        >
          <Search className="w-4 h-4 shrink-0" />
          <span className="truncate">{showAddressSearch ? "" : "Cerca un altro indirizzo..."}</span>
        </button>

        {showAddressSearch && (
          <div className="absolute top-[62px] left-4 right-16 bg-background rounded-2xl shadow-xl z-[1000] overflow-hidden">
            <input
              autoFocus
              value={addressQuery}
              onChange={(e) => handleAddressInput(e.target.value)}
              placeholder="Via, numero, città..."
              className="w-full h-11 px-4 text-sm bg-transparent focus:outline-none border-b border-border/50"
            />
            {searchingAddress && (
              <p className="px-4 py-2 text-xs text-muted-foreground">Ricerca in corso...</p>
            )}
            {!searchingAddress && addressResults.map((r, i) => (
              <button
                key={i}
                onClick={() => selectAddressResult(r)}
                className="w-full text-left px-4 py-2.5 text-xs hover:bg-muted transition-colors border-b border-border/30 last:border-0"
              >
                {r.label}
              </button>
            ))}
          </div>
        )}

        {gpsError && (
          <div className="absolute top-4 left-4 right-16 bg-destructive/90 text-destructive-foreground text-xs rounded-xl px-3 py-2 flex items-center gap-2 z-[1000]">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {gpsError}
          </div>
        )}
      </div>

      <div className="p-4 bg-card border-t border-border/50 space-y-3">
        <div className="flex items-center gap-2">
          <Navigation2 className="w-4 h-4 text-primary" />
          <p className="text-sm font-semibold truncate">{destination?.label || "Cerca una destinazione qui sopra"}</p>
        </div>

        {!destination ? null : loadingRoute && !route ? (
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
