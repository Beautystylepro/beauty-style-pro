import MobileLayout from "@/components/layout/MobileLayout";
import InteractiveMap, { MapMarker } from "@/components/map/InteractiveMap";
import { ArrowLeft, Search, MapPin, Star, Filter, Sparkles, Home, Locate, Briefcase, Calendar, Tag } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import useGeolocation, { haversineDistance, getCoordsFromCity, ITALIAN_CITIES } from "@/hooks/useGeolocation";
import { toast } from "sonner";

type Professional = {
  id: string;
  business_name: string;
  specialty: string | null;
  city: string | null;
  rating: number | null;
  review_count: number | null;
  hourly_rate: number | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  description: string | null;
  is_verified: boolean | null;
  avatar?: string;
  distance?: number;
  aiScore?: number;
  source?: "professional" | "profile";
  user_id?: string;
};

type JobPost = {
  id: string;
  title: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  category: string;
};

type EventItem = {
  id: string;
  title: string;
  location: string | null;
  start_date: string;
};

const SPECIALTIES = ["Hairstylist", "Colorist", "Barber", "Estetista", "Nail Artist", "Makeup Artist", "Massaggiatore"];

type MarkerFilter = "all" | "salon" | "job" | "event";

export default function MapSearchPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { position, coords, detectGPS, setCity, loading: gpsLoading } = useGeolocation();
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [specialtyFilter, setSpecialtyFilter] = useState("");
  const [maxDistance, setMaxDistance] = useState(50);
  // Deep-link support: /map-search?home=1 (used by the "Domicilio" quick
  // action on the home screen) lands here with the filter already active,
  // instead of dropping the user on an unfiltered map they'd have to
  // configure themselves.
  const [homeService, setHomeService] = useState(searchParams.get("home") === "1");
  const [showFilters, setShowFilters] = useState(searchParams.get("home") === "1");
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [jobs, setJobs] = useState<JobPost[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [markerFilter, setMarkerFilter] = useState<MarkerFilter>("all");
  const [aiSuggestion, setAiSuggestion] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    loadProfessionals();
    loadJobs();
    loadEvents();
    loadUserPrefs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadUserPrefs = async () => {
    if (!user) return;
    const { data } = await supabase.from("profiles").select("city, latitude, longitude").eq("user_id", user.id).maybeSingle();
    if (data?.city) setCity(data.city);
  };

  const loadProfessionals = async () => {
    // Load professionals, registered businesses (salons/companies), AND
    // any other GPS-tagged profile as a last-resort fallback. Businesses
    // were previously only picked up via the generic profiles fallback
    // below, showing just a bare pin with the owner's personal name — no
    // real business name, specialty, or rating, unlike professionals.
    const { data } = await supabase.from("professionals")
      .select("id, business_name, specialty, city, rating, review_count, hourly_rate, latitude, longitude, address, description, is_verified, user_id");

    const { data: businessesData } = await supabase.from("businesses")
      .select("id, business_name, business_type, city, rating, review_count, latitude, longitude, address, description, verified, user_id, logo_url")
      .not("latitude", "is", null)
      .not("longitude", "is", null);
    
    // Also load profiles that have coordinates (registered users nearby)
    const { data: profilesWithGps } = await supabase.from("profiles")
      .select("user_id, display_name, avatar_url, city, latitude, longitude, user_type")
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .limit(50);

    const allPros: Professional[] = [];
    
    if (data && data.length > 0) {
      data.forEach((p: any) => {
        allPros.push({ ...p, avatar: p.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.id}`, source: "professional", user_id: p.user_id });
      });
    }

    if (businessesData && businessesData.length > 0) {
      businessesData.forEach((b: any) => {
        allPros.push({
          id: b.id,
          user_id: b.user_id,
          source: "business",
          business_name: b.business_name || "Salone",
          specialty: b.business_type || "Salone/Azienda",
          city: b.city,
          rating: b.rating,
          review_count: b.review_count,
          hourly_rate: null,
          latitude: b.latitude,
          longitude: b.longitude,
          address: b.address,
          description: b.description,
          is_verified: b.verified,
          avatar: b.logo_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${b.id}`,
        });
      });
    }
    
    // Last-resort fallback: any other registered professional/business
    // profile with GPS but no row yet in professionals/businesses.
    if (profilesWithGps) {
      profilesWithGps.forEach(p => {
        if ((p.user_type === "professional" || p.user_type === "business") && !allPros.find(pro => pro.user_id === p.user_id)) {
          allPros.push({
            id: p.user_id,
            user_id: p.user_id,
            source: "profile",
            business_name: p.display_name || "Utente",
            specialty: p.user_type === "business" ? "Business" : "Professionista",
            city: p.city,
            rating: null,
            review_count: null,
            hourly_rate: null,
            latitude: p.latitude,
            longitude: p.longitude,
            address: null,
            description: null,
            is_verified: null,
            avatar: p.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.user_id}`,
          });
        }
      });
    }

    setProfessionals(allPros);
  };

  const loadJobs = async () => {
    const { data } = await supabase.from("job_posts")
      .select("id, title, location, latitude, longitude, category")
      .eq("status", "active")
      .limit(50);
    if (data) setJobs(data);
  };

  const loadEvents = async () => {
    const { data } = await supabase.from("events")
      .select("id, title, location, start_date")
      .gte("end_date", new Date().toISOString())
      .limit(50);
    if (data) setEvents(data);
  };

  const handleDetectGPS = () => {
    detectGPS(user?.id);
  };

  const professionalsWithDistance = useMemo(() => {
    return professionals.map(p => {
      const pLat = p.latitude || getCoordsFromCity(p.city || "Milano")[0];
      const pLng = p.longitude || getCoordsFromCity(p.city || "Milano")[1];
      const distance = haversineDistance(coords[0], coords[1], pLat, pLng);
      const aiScore = Math.min(100, Math.round(
        (p.rating || 0) * 12 + (p.review_count || 0) * 0.08 + (p.is_verified ? 15 : 0) + Math.max(0, 35 - distance * 0.08)
      ));
      return { ...p, distance: Math.round(distance * 10) / 10, aiScore, latitude: pLat, longitude: pLng };
    });
  }, [professionals, coords]);

  const filtered = useMemo(() => {
    return professionalsWithDistance
      .filter(p => {
        if (search && !p.business_name.toLowerCase().includes(search.toLowerCase()) && !(p.specialty || "").toLowerCase().includes(search.toLowerCase())) return false;
        if (cityFilter && (p.city || "").toLowerCase() !== cityFilter.toLowerCase()) return false;
        if (specialtyFilter && (p.specialty || "").toLowerCase() !== specialtyFilter.toLowerCase()) return false;
        if (p.distance !== undefined && p.distance > maxDistance) return false;
        return true;
      })
      .sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0));
  }, [professionalsWithDistance, search, cityFilter, specialtyFilter, maxDistance]);

  // Build map markers — multi-type
  const mapMarkers: MapMarker[] = useMemo(() => {
    const markers: MapMarker[] = [];

    // Salon markers
    if (markerFilter === "all" || markerFilter === "salon") {
      filtered.slice(0, 30).forEach(p => {
        markers.push({
          id: p.id,
          lat: p.latitude!,
          lng: p.longitude!,
          label: p.business_name,
          sublabel: `${p.specialty || "Beauty"} · ${p.distance}km · ${p.rating ? `★${p.rating}` : ""} · Disponibile`,
          type: p.is_verified ? "premium" : "salon",
          rating: p.rating || undefined,
          onClick: () => navigate(p.source === "profile" ? `/profile/${p.user_id}` : `/stylist/${p.id}`),
        });
      });
    }

    // Job markers
    if (markerFilter === "all" || markerFilter === "job") {
      jobs.forEach(j => {
        const jCoords = j.latitude && j.longitude
          ? [j.latitude, j.longitude]
          : getCoordsFromCity(j.location || "Milano");
        markers.push({
          id: `job-${j.id}`,
          lat: jCoords[0],
          lng: jCoords[1],
          label: j.title,
          sublabel: `${j.category} · ${j.location}`,
          type: "job",
          onClick: () => navigate(`/job/${j.id}`),
        });
      });
    }

    // Event markers
    if (markerFilter === "all" || markerFilter === "event") {
      events.forEach(e => {
        const eCoords = getCoordsFromCity(e.location || "Milano");
        markers.push({
          id: `event-${e.id}`,
          lat: eCoords[0],
          lng: eCoords[1],
          label: e.title,
          sublabel: new Date(e.start_date).toLocaleDateString("it-IT"),
          type: "event",
          onClick: () => navigate(`/events`),
        });
      });
    }

    return markers;
  }, [filtered, jobs, events, markerFilter, navigate]);

  const mapZoom = useMemo(() => {
    if (maxDistance > 200) return 6;
    if (maxDistance > 100) return 7;
    if (maxDistance > 50) return 9;
    if (maxDistance > 20) return 11;
    if (maxDistance > 10) return 13;
    return 15;
  }, [maxDistance]);

  const handleAiSearch = async () => {
    if (!search.trim()) { toast.error("Scrivi cosa cerchi..."); return; }
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-router", {
        body: {
          role: "map",
          user_id: user?.id,
          message: `Cerca "${search}" nella zona di ${position.city}. Professionisti disponibili: ${filtered.slice(0, 5).map(p => `${p.business_name} (${p.specialty}, ${p.distance}km, rating ${p.rating}, match ${p.aiScore}%)`).join("; ")}. Lavori: ${jobs.length}. Eventi: ${events.length}.`,
          context: { city: position.city, lat: coords[0], lng: coords[1], results_count: filtered.length },
        },
      });
      if (data?.reply) {
        setAiSuggestion(data.reply);
      } else {
        const top = filtered[0];
        setAiSuggestion(top
          ? `${filtered.length} risultati per "${search}". Consigliato: ${top.business_name} — ${top.aiScore}% match, ${top.distance}km.`
          : `Nessun risultato per "${search}".`
        );
      }
    } catch {
      const top = filtered[0];
      setAiSuggestion(top
        ? `${filtered.length} risultati. Top: ${top.business_name} (${top.aiScore}%).`
        : `Nessun risultato.`
      );
    }
    setAiLoading(false);
  };

  const filterButtons: { key: MarkerFilter; label: string; icon: any; count: number }[] = [
    { key: "all", label: "Tutti", icon: MapPin, count: filtered.length + jobs.length + events.length },
    { key: "salon", label: "Saloni", icon: Star, count: filtered.length },
    { key: "job", label: "Lavoro", icon: Briefcase, count: jobs.length },
    { key: "event", label: "Eventi", icon: Calendar, count: events.length },
  ];

  return (
    <MobileLayout>
      <header className="sticky top-0 z-40 glass px-5 py-3">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-display font-bold">Trova Professionisti</h1>
          <div className="ml-auto flex gap-1.5">
            <button onClick={handleDetectGPS} disabled={gpsLoading}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted transition-colors">
              <Locate className={`w-4 h-4 ${gpsLoading ? "animate-spin text-primary" : "text-muted-foreground"}`} />
            </button>
            <button onClick={() => setShowFilters(!showFilters)}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted transition-colors">
              <Filter className={`w-4 h-4 ${showFilters ? "text-primary" : "text-muted-foreground"}`} />
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAiSearch()}
              placeholder="Cerca per nome, specialità, città..."
              className="w-full h-10 rounded-xl bg-card border border-border/50 pl-10 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
          </div>
          <button onClick={handleAiSearch} disabled={aiLoading}
            className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50">
            <Sparkles className="w-4 h-4" />
            {aiLoading ? "..." : "AI"}
          </button>
        </div>

        {/* Marker type filter chips */}
        <div className="flex gap-1.5 mt-2.5 overflow-x-auto no-scrollbar">
          {filterButtons.map(f => (
            <button key={f.key} onClick={() => setMarkerFilter(f.key)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors ${
                markerFilter === f.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}>
              <f.icon className="w-3 h-3" />
              {f.label}
              <span className="text-xs opacity-70">({f.count})</span>
            </button>
          ))}
        </div>

        {showFilters && (
          <div className="mt-3 p-4 rounded-2xl bg-card border border-border/50 space-y-3 fade-in">
            <div className="flex gap-2">
              <select value={cityFilter} onChange={e => setCityFilter(e.target.value)}
                className="flex-1 h-9 rounded-lg bg-muted border border-border/50 px-3 text-xs focus:outline-none">
                <option value="">Tutte le città</option>
                {ITALIAN_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={specialtyFilter} onChange={e => setSpecialtyFilter(e.target.value)}
                className="flex-1 h-9 rounded-lg bg-muted border border-border/50 px-3 text-xs focus:outline-none">
                <option value="">Tutte le specialità</option>
                {SPECIALTIES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-xs text-muted-foreground">Distanza max</span>
                <span className="text-xs font-bold text-primary">{maxDistance} km</span>
              </div>
              <input type="range" min={5} max={300} value={maxDistance} onChange={e => setMaxDistance(Number(e.target.value))} className="w-full accent-primary h-1" />
            </div>
            <button onClick={() => setHomeService(!homeService)}
              className={`w-full py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all duration-200 ${
                homeService ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>
              <Home className="w-4 h-4" /> A Domicilio
            </button>
          </div>
        )}
      </header>

      {/* AI Suggestion */}
      {aiSuggestion && (
        <div className="mx-5 mt-3 p-4 rounded-2xl bg-card border border-primary/10">
          <div className="flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <p className="text-xs leading-relaxed">{aiSuggestion}</p>
          </div>
        </div>
      )}

      {/* Interactive Map */}
      <div className="mx-5 mt-3">
        <InteractiveMap
          center={coords}
          zoom={mapZoom}
          markers={mapMarkers}
          height={260}
          showUserMarker={true}
          onMarkerClick={(m) => {
            if (m.onClick) m.onClick();
          }}
        />
        <div className="flex items-center justify-between mt-1.5 px-1">
          <span className="text-xs text-muted-foreground">📍 {position.city}</span>
          <span className="text-xs text-primary font-medium">{mapMarkers.length} risultati sulla mappa</span>
        </div>
      </div>

      {/* Results */}
      <div className="px-5 py-4 space-y-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground font-medium">Ordinati per AI Match ↓</span>
        </div>

        {filtered.map((p, i) => (
          <div key={p.id} className="rounded-2xl bg-card border border-border/50 overflow-hidden hover:border-primary/20 transition-all duration-200">
            <button onClick={() => navigate(p.source === "profile" ? `/profile/${p.user_id}` : `/stylist/${p.id}`)}
              className="w-full flex items-center gap-3 p-3.5 text-left">
              <div className="relative">
                <img
                  src={p.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.id}`}
                  alt=""
                  className="w-12 h-12 rounded-xl object-cover"
                />
                {p.is_verified && (
                  <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                    <span className="text-[7px] text-primary-foreground">✓</span>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{p.business_name}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{p.specialty}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Star className="w-3 h-3 text-accent fill-accent" />
                  <span className="text-[11px] font-medium">{p.rating || 0}</span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <MapPin className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs font-semibold text-primary">{p.distance} km</span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-emerald-500 font-medium">Disponibile</span>
                </div>
              </div>
              <div className="text-right flex flex-col items-end gap-1">
                <div className="px-2 py-0.5 rounded-full bg-primary/10">
                  <span className="text-xs font-bold text-primary">{p.aiScore}%</span>
                </div>
                <p className="text-sm font-bold">€{p.hourly_rate || 0}</p>
              </div>
            </button>
            <div className="flex">
              <button
                onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}`, "_blank")}
                className="flex-1 py-2.5 bg-muted text-foreground text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-muted/80 transition-colors border-r border-border/30">
                <Locate className="w-3.5 h-3.5" /> Indicazioni
              </button>
              <button
                onClick={() => navigate(`/booking/${p.id}`)}
                className="flex-1 py-2.5 bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-primary/90 transition-colors">
                <Calendar className="w-3.5 h-3.5" /> Prenota ora
              </button>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-12">
            <MapPin className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Nessun risultato</p>
            <p className="text-xs text-muted-foreground mt-1">Prova ad ampliare la distanza</p>
          </div>
        )}
      </div>
    </MobileLayout>
  );
}
