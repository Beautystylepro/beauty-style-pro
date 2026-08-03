import { useEffect, useRef, useState } from "react";

// A vera navigazione richiede la posizione che si aggiorna DA SOLA man
// mano che ci si muove (watchPosition), non una singola lettura GPS
// come useGeolocation (getCurrentPosition) — quella basta per "trovami
// professionisti vicino a me", ma non per seguire un percorso in
// tempo reale mentre si guida/cammina.
export default function useLiveTracking(active: boolean) {
  const [position, setPosition] = useState<{ lat: number; lng: number; heading: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    if (!("geolocation" in navigator)) {
      setError("Il tuo dispositivo non supporta il GPS");
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          heading: pos.coords.heading,
        });
        setError(null);
      },
      (err) => {
        setError(err.message || "Impossibile accedere al GPS");
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [active]);

  return { position, error };
}
