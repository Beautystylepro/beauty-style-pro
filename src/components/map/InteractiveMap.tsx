import { useEffect, useRef, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

// Fix Leaflet default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  sublabel?: string;
  type: "salon" | "offer" | "job" | "event" | "shop" | "user" | "premium";
  rating?: number;
  onClick?: () => void;
}

const MARKER_COLORS: Record<string, string> = {
  salon: "#3b82f6",    // blue
  offer: "#22c55e",    // green
  job: "#ef4444",      // red
  event: "#a855f7",    // purple
  shop: "#f59e0b",     // amber
  user: "#06b6d4",     // cyan
  premium: "#eab308",  // gold
};

function createColorIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="
      width: 28px; height: 28px; border-radius: 50% 50% 50% 0;
      background: ${color}; border: 3px solid white;
      transform: rotate(-45deg); box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      display: flex; align-items: center; justify-content: center;
    "><div style="
      width: 8px; height: 8px; border-radius: 50%; background: white; transform: rotate(45deg);
    "></div></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28],
  });
}

// Custom cluster bubbles matching the app's brand gradient (instead of
// Leaflet's default yellow/orange clusters), sized by how many markers
// they group — this is the difference between a map that reads as
// professional at scale (Booking.com/Airbnb style) vs a scattered mess of
// overlapping pins once a city has more than a handful of professionals.
function createClusterIcon(cluster: L.MarkerCluster): L.DivIcon {
  const count = cluster.getChildCount();
  const size = count < 10 ? 36 : count < 50 ? 44 : 52;
  const fontSize = count < 10 ? 13 : count < 50 ? 14 : 16;
  return L.divIcon({
    html: `<div style="
      width: ${size}px; height: ${size}px; border-radius: 50%;
      background: linear-gradient(135deg, #a855f7, #ec4899);
      border: 3px solid white; box-shadow: 0 3px 10px rgba(168,85,247,0.4);
      display: flex; align-items: center; justify-content: center;
      color: white; font-weight: 700; font-size: ${fontSize}px;
    ">${count}</div>`,
    className: "custom-cluster-icon",
    iconSize: L.point(size, size),
  });
}

interface Props {
  center: [number, number];
  zoom?: number;
  markers?: MapMarker[];
  height?: number | string;
  className?: string;
  showUserMarker?: boolean;
  onMarkerClick?: (marker: MapMarker) => void;
  // Real turn-by-turn route geometry (the "blue line"), an ordered list
  // of [lat, lng] points following actual roads — fetched from a real
  // routing service, not a straight line between two points.
  routeCoords?: [number, number][];
}

export default function InteractiveMap({
  center,
  zoom = 12,
  markers = [],
  height = 280,
  className = "",
  showUserMarker = true,
  onMarkerClick,
  routeCoords,
}: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const userMarkerLayerRef = useRef<L.LayerGroup | null>(null);
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center,
      zoom,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.control.attribution({ position: "bottomleft", prefix: false }).addTo(map);

    userMarkerLayerRef.current = L.layerGroup().addTo(map);
    clusterGroupRef.current = L.markerClusterGroup({
      iconCreateFunction: createClusterIcon,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      maxClusterRadius: 50,
    }).addTo(map);
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      userMarkerLayerRef.current = null;
      clusterGroupRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update center/zoom
  useEffect(() => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView(center, zoom, { animate: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center[0], center[1], zoom]);

  // Update markers
  useEffect(() => {
    if (!userMarkerLayerRef.current || !clusterGroupRef.current) return;
    userMarkerLayerRef.current.clearLayers();
    clusterGroupRef.current.clearLayers();

    // User marker (never clustered — always shown on its own)
    if (showUserMarker) {
      const userIcon = L.divIcon({
        className: "user-marker",
        html: `<div style="
          width: 16px; height: 16px; border-radius: 50%;
          background: #3b82f6; border: 3px solid white;
          box-shadow: 0 0 0 3px rgba(59,130,246,0.3), 0 2px 8px rgba(0,0,0,0.2);
          animation: pulse 2s ease-in-out infinite;
        "></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      L.marker(center, { icon: userIcon })
        .bindPopup("<b>Tu sei qui</b>")
        .addTo(userMarkerLayerRef.current);
    }

    // Data markers — clustered so the map stays readable as results grow,
    // instead of overlapping pins piling up on top of each other
    const clusterMarkers: L.Marker[] = markers.map((m) => {
      const color = MARKER_COLORS[m.type] || MARKER_COLORS.salon;
      const icon = createColorIcon(color);
      const marker = L.marker([m.lat, m.lng], { icon });

      const ratingHtml = m.rating ? `<br><span style="color: #f59e0b;">★ ${m.rating}</span>` : "";
      marker.bindPopup(`<b>${m.label}</b>${m.sublabel ? `<br><span style="font-size:12px;color:#888;">${m.sublabel}</span>` : ""}${ratingHtml}`);

      marker.on("click", () => {
        if (onMarkerClick) onMarkerClick(m);
      });

      return marker;
    });
    clusterGroupRef.current.addLayers(clusterMarkers);
  }, [markers, center, showUserMarker, onMarkerClick]);

  // Draw the real route (the "blue line") when navigation is active,
  // and keep the map framed on the whole route as it's recalculated.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (routeLayerRef.current) {
      map.removeLayer(routeLayerRef.current);
      routeLayerRef.current = null;
    }

    if (routeCoords && routeCoords.length > 1) {
      const polyline = L.polyline(routeCoords, {
        color: "#3b82f6",
        weight: 6,
        opacity: 0.85,
        lineCap: "round",
      }).addTo(map);
      routeLayerRef.current = polyline;
      map.fitBounds(polyline.getBounds(), { padding: [40, 40] });
    }
  }, [routeCoords]);

  return (
    <div className={`relative rounded-2xl overflow-hidden border border-border/50 ${className}`} style={{ height }}>
      <div ref={mapContainerRef} className="w-full h-full" />
      {/* Legend */}
      <div className="absolute top-2 left-2 bg-card/90 backdrop-blur-sm rounded-lg px-2 py-1.5 border border-border/50 flex flex-wrap gap-x-3 gap-y-0.5">
        {[
          { type: "salon", label: "Saloni" },
          { type: "offer", label: "Offerte" },
          { type: "job", label: "Lavoro" },
          { type: "event", label: "Eventi" },
        ].map((item) => (
          <div key={item.type} className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: MARKER_COLORS[item.type] }} />
            <span className="text-xs text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 3px rgba(59,130,246,0.3), 0 2px 8px rgba(0,0,0,0.2); }
          50% { box-shadow: 0 0 0 8px rgba(59,130,246,0.1), 0 2px 8px rgba(0,0,0,0.2); }
        }
      `}</style>
    </div>
  );
}
