import MobileLayout from "@/components/layout/MobileLayout";
import { ArrowLeft, Search, MapPin, Star, Navigation, Filter } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import useGeolocation, { haversineDistance, getCoordsFromCity } from "@/hooks/useGeolocation";

type Stylist = {
  id: string;
  business_name: string;
  specialty: string | null;
  city: string | null;
  rating: number | null;
  review_count: number | null;
  hourly_rate: number | null;
  latitude: number | null;
  longitude: number | null;
  avatar: string | null;
  user_id?: string;
  distance?: number;
};

const SPECIALTIES = ["Tutti", "Hairstylist", "Colorist", "Barber", "Estetista", "Nail Artist", "Makeup Artist", "Massaggiatore"];

export default function StylistsPage() {
  const navigate = useNavigate();
  const { coords } = useGeolocation();
  const [search, setSearch] = useState("");
  const [specialty, setSpecialty] = useState<string>("Tutti");
  const [stylists, setStylists] = useState<Stylist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadProfessionals(); }, []);

  const loadProfessionals = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("professionals")
      .select("id, user_id, business_name, specialty, city, rating, review_count, hourly_rate, latitude, longitude, profiles:user_id(avatar_url)")
      .order("rating", { ascending: false });
    if (data) {
      // Chi ha un abbonamento attivo (Pro/Business/Premium) sale in cima
      // ai risultati — è un vantaggio reale promesso in pagina abbonamenti,
      // prima non veniva mai applicato qui.
      const userIds = data.map((p: any) => p.user_id).filter(Boolean);
      const { data: activeSubs } = userIds.length
        ? await supabase.from("user_subscriptions").select("user_id").eq("status", "active").in("user_id", userIds)
        : { data: [] as { user_id: string }[] };
      const subscriberIds = new Set((activeSubs || []).map((s) => s.user_id));

      const withPriority = data
        .map((p: any) => ({
          ...p,
          avatar: (Array.isArray(p.profiles) ? p.profiles[0]?.avatar_url : p.profiles?.avatar_url) || null,
          isPrioritySubscriber: subscriberIds.has(p.user_id),
        }))
        .sort((a: any, b: any) => {
          if (a.isPrioritySubscriber !== b.isPrioritySubscriber) return a.isPrioritySubscriber ? -1 : 1;
          return (b.rating || 0) - (a.rating || 0);
        });
      setStylists(withPriority);
    }
    setLoading(false);
  };

  const enriched = useMemo(() => stylists.map(s => {
    const lat = s.latitude ?? (s.city ? getCoordsFromCity(s.city)[0] : null);
    const lng = s.longitude ?? (s.city ? getCoordsFromCity(s.city)[1] : null);
    const distance = lat != null && lng != null
      ? Math.round(haversineDistance(coords[0], coords[1], lat, lng) * 10) / 10
      : undefined;
    return { ...s, distance };
  }), [stylists, coords]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched
      .filter(s => {
        if (specialty !== "Tutti" && (s.specialty || "").toLowerCase() !== specialty.toLowerCase()) return false;
        if (!q) return true;
        return s.business_name.toLowerCase().includes(q)
          || (s.specialty || "").toLowerCase().includes(q)
          || (s.city || "").toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const da = a.distance ?? 9999;
        const db = b.distance ?? 9999;
        if (da !== db) return da - db;
        return (b.rating ?? 0) - (a.rating ?? 0);
      });
  }, [enriched, search, specialty]);

  return (
    <MobileLayout>
      <header className="sticky top-0 z-40 glass px-5 py-3">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-display font-bold">Professionisti</h1>
        </div>
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca per nome, servizio o città..."
            className="w-full h-10 rounded-xl bg-card border border-border/50 pl-10 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
        </div>
        <div className="flex gap-1.5 mt-2.5 overflow-x-auto no-scrollbar">
          {SPECIALTIES.map(s => (
            <button key={s} type="button" aria-label={`Filtra ${s}`} onClick={() => setSpecialty(s)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                specialty === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>
              {s === "Tutti" ? <Filter className="w-3 h-3" /> : null}{s}
            </button>
          ))}
        </div>
      </header>

      <div className="px-5 py-4 space-y-2">
        {loading && (
          <div className="space-y-2">
            {[1,2,3,4].map(i => <div key={i} className="h-20 rounded-2xl bg-card animate-pulse" />)}
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-16">
            <p className="text-sm text-muted-foreground">Nessun professionista trovato.</p>
          </div>
        )}
        {!loading && filtered.map(stylist => (
          <button key={stylist.id} onClick={() => navigate(`/stylist/${stylist.id}`)}
            className="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-card border border-border/50 hover:border-primary/20 transition-all duration-200 text-left">
            <img
              src={stylist.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${stylist.id}`}
              alt=""
              className="w-14 h-14 rounded-xl object-cover"
            />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{stylist.business_name}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{stylist.specialty || "Beauty Pro"}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <Star className="w-3 h-3 text-accent fill-accent" />
                <span className="text-xs font-medium">{stylist.rating ?? "—"}</span>
                {stylist.review_count != null && (
                  <span className="text-xs text-muted-foreground">({stylist.review_count})</span>
                )}
                {stylist.city && (
                  <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                    <MapPin className="w-3 h-3" />{stylist.city}
                  </span>
                )}
                {stylist.distance !== undefined && (
                  <span className="text-xs text-primary font-semibold flex items-center gap-0.5">
                    <Navigation className="w-2.5 h-2.5" />{stylist.distance} km
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              {stylist.hourly_rate != null && (
                <>
                  <p className="text-sm font-bold">€{stylist.hourly_rate}</p>
                  <p className="text-xs text-muted-foreground">/ora</p>
                </>
              )}
              <button type="button" aria-label="Prenota" onClick={e => { e.stopPropagation(); navigate(`/booking/${stylist.id}`); }}
                className="mt-1 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                Prenota
              </button>
            </div>
          </button>
        ))}
      </div>
    </MobileLayout>
  );
}