import MobileLayout from "@/components/layout/MobileLayout";
import BookingReceipt from "@/components/BookingReceipt";
import { ArrowLeft, Calendar as CalendarIcon, Clock, MapPin, Star, Check, Building2, Home, Monitor, Scissors } from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import WhatsAppButton from "@/components/WhatsAppButton";
import { DEFAULT_TIME_SLOTS, getAvailableSlots } from "@/lib/availability";

interface Service {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
}

interface Professional {
  id: string;
  business_name: string;
  specialty: string | null;
  city: string | null;
  rating: number | null;
  review_count: number | null;
  user_id: string;
}

const locationOptions = [
  { id: "center", label: "In Salone", Icon: Building2 },
  { id: "home", label: "A Domicilio", Icon: Home },
  { id: "online", label: "Online", Icon: Monitor },
];

const timeSlots = DEFAULT_TIME_SLOTS;

export default function BookingPage() {
  const navigate = useNavigate();
  const { id: paramId } = useParams();
  const [searchParams] = useSearchParams();
  const professionalId = paramId || searchParams.get("professional");
  const preselectedService = searchParams.get("service");

  const { user } = useAuth();
  const [professional, setProfessional] = useState<Professional | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedService, setSelectedService] = useState<string | null>(preselectedService);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  });
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [selectedLocation, setSelectedLocation] = useState("center");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [availableSlots, setAvailableSlots] = useState<string[]>(timeSlots);
  const [checkingAvailability, setCheckingAvailability] = useState(false);

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [professionalId]);

  const loadData = async () => {
    if (!professionalId) {
      // No professional selected — load all professionals for selection
      setLoadingData(false);
      return;
    }

    const [{ data: pro }, { data: svc }] = await Promise.all([
      supabase.from("professionals").select("*").eq("id", professionalId).maybeSingle(),
      supabase.from("services").select("*").eq("professional_id", professionalId).eq("active", true),
    ]);

    if (pro) setProfessional(pro);
    if (svc && svc.length > 0) {
      setServices(svc);
    } else if (pro) {
      // If professional exists but no services, create default services
      setServices([
        { id: "default-1", name: "Consulenza", price: 30, duration_minutes: 30 },
        { id: "default-2", name: "Servizio Base", price: 45, duration_minutes: 60 },
      ]);
    }
    setLoadingData(false);
  };

  const dates = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i + 1);
    return d;
  });

  const dayNames = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];

  const selectedServiceData = services.find(s => s.id === selectedService);

  useEffect(() => {
    if (!professional?.id || !selectedDate) return;
    let cancelled = false;
    setCheckingAvailability(true);
    getAvailableSlots(professional.id, selectedDate, selectedServiceData?.duration_minutes || 30)
      .then((slots) => {
        if (cancelled) return;
        setAvailableSlots(slots);
        if (selectedTime && !slots.includes(selectedTime)) {
          setSelectedTime(null);
          toast.info("Quell'orario non è più disponibile, scegline un altro");
        }
      })
      .finally(() => { if (!cancelled) setCheckingAvailability(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [professional?.id, selectedDate, selectedServiceData?.duration_minutes]);

  const handleConfirm = async () => {
    if (!user) {
      toast.error("Devi effettuare l'accesso per prenotare");
      navigate("/auth");
      return;
    }
    if (!selectedService || !selectedTime || !professional) {
      toast.error("Seleziona servizio e orario");
      return;
    }

    setLoading(true);

    const freshSlots = await getAvailableSlots(professional.id, selectedDate, selectedServiceData?.duration_minutes || 30);
    if (!freshSlots.includes(selectedTime)) {
      toast.error("Questo orario è appena stato prenotato da qualcun altro, scegline un altro");
      setAvailableSlots(freshSlots);
      setSelectedTime(null);
      setLoading(false);
      return;
    }

    const durationMinutes = selectedServiceData?.duration_minutes || 30;
    const [startH, startM] = selectedTime.split(":").map(Number);
    const endTotalMinutes = startH * 60 + startM + durationMinutes;
    const endTime = `${Math.floor(endTotalMinutes / 60).toString().padStart(2, "0")}:${(endTotalMinutes % 60).toString().padStart(2, "0")}`;

    const { data: booking, error } = await supabase
      .from("bookings")
      .insert({
        client_id: user.id,
        professional_id: professional.id,
        service_id: selectedServiceData?.id.startsWith("default-") ? undefined : selectedService,
        booking_date: selectedDate,
        start_time: selectedTime,
        end_time: endTime,
        total_price: selectedServiceData?.price,
        notes: notes || undefined,
      })
      .select("id")
      .single();

    if (error || !booking) {
      console.error("Booking error:", error);
      toast.error("Errore nella prenotazione");
      setLoading(false);
    } else {
      toast.success("Prenotazione creata! Procedi al pagamento.");
      const desc = `${selectedServiceData?.name || "Servizio"} · ${selectedDate} ${selectedTime}`;
      navigate(
        `/checkout?amount=${selectedServiceData?.price || 0}&desc=${encodeURIComponent(desc)}&type=booking&ref=${booking.id}`
      );
    }
  };

  if (confirmed) {
    return (
      <MobileLayout>
        <header className="sticky top-0 z-40 glass px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate("/")} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-display font-bold">Ricevuta</h1>
        </header>
        <div className="px-4 py-6 fade-in">
          <BookingReceipt
            booking={{
              id: Date.now().toString(),
              booking_date: selectedDate,
              start_time: selectedTime || "",
              total_price: selectedServiceData?.price || null,
              notes: notes || null,
              status: "pending",
            }}
            professional={professional ? { business_name: professional.business_name, city: professional.city } : null}
            service={selectedServiceData ? { name: selectedServiceData.name, duration_minutes: selectedServiceData.duration_minutes } : null}
            clientName={user?.email?.split("@")[0] || "Cliente"}
          />
          <div className="flex gap-3 mt-6">
            <button onClick={() => navigate("/my-bookings")} className="flex-1 py-3 rounded-xl gradient-primary text-primary-foreground font-semibold text-sm">
              Le Mie Prenotazioni
            </button>
            <button onClick={() => navigate("/")} className="flex-1 py-3 rounded-xl bg-muted font-semibold text-sm">
              Home
            </button>
          </div>
        </div>
      </MobileLayout>
    );
  }

  // If no professional selected, redirect to stylists
  if (!professionalId && !loadingData) {
    return (
      <MobileLayout>
        <header className="sticky top-0 z-40 glass px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-display font-bold">Prenota</h1>
        </header>
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
          <Scissors className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-display font-bold mb-2">Scegli un professionista</h2>
          <p className="text-muted-foreground text-sm mb-6">Seleziona uno stilista per prenotare</p>
          <button onClick={() => navigate("/stylists")} className="px-6 py-3 rounded-full gradient-primary text-primary-foreground font-semibold">
            Sfoglia Stylists
          </button>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout>
      <header className="sticky top-0 z-40 glass px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-display font-bold">Prenota Appuntamento</h1>
      </header>

      {loadingData ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="px-4 py-4 space-y-6">
          {/* Professional Card */}
          {professional && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-card shadow-card">
              <div className="w-14 h-14 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-xl font-bold">
                {professional.business_name[0]}
              </div>
              <div className="flex-1">
                <p className="font-semibold">{professional.business_name}</p>
                <p className="text-xs text-muted-foreground">{professional.specialty || "Beauty Pro"} · {professional.city || ""}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Star className="w-3 h-3 text-gold fill-gold" />
                  <span className="text-xs font-semibold">{professional.rating || "N/A"}</span>
                  <span className="text-xs text-muted-foreground">({professional.review_count || 0} reviews)</span>
                </div>
              </div>
              <WhatsAppButton userId={professional.user_id} name={professional.business_name} context="booking" compact />
            </div>
          )}

          {/* Services */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Seleziona Servizio
            </h3>
            <div className="space-y-2">
              {services.map(service => (
                <button
                  key={service.id}
                  onClick={() => setSelectedService(service.id)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${
                    selectedService === service.id
                      ? "bg-primary/10 border border-primary/30"
                      : "bg-card hover:bg-muted"
                  }`}
                >
                  <div className="text-left">
                    <p className="text-sm font-medium">{service.name}</p>
                    <p className="text-xs text-muted-foreground">{service.duration_minutes} min</p>
                  </div>
                  <span className="text-sm font-bold text-primary">€{service.price}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Date Selection */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              <CalendarIcon className="w-4 h-4 inline mr-1" /> Seleziona Data
            </h3>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
              {dates.map(date => {
                const dateStr = date.toISOString().split("T")[0];
                const isSelected = selectedDate === dateStr;
                return (
                  <button
                    key={dateStr}
                    onClick={() => setSelectedDate(dateStr)}
                    className={`flex flex-col items-center min-w-[52px] py-2 px-2 rounded-xl transition-all ${
                      isSelected ? "gradient-primary text-primary-foreground" : "bg-card"
                    }`}
                  >
                    <span className="text-xs font-medium">{dayNames[date.getDay()]}</span>
                    <span className="text-lg font-bold">{date.getDate()}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time Selection */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 inline mr-1" /> Seleziona Orario
              {checkingAvailability && (
                <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              )}
            </h3>
            <div className="grid grid-cols-4 gap-2">
              {timeSlots.map(time => {
                const isAvailable = availableSlots.includes(time);
                return (
                  <button
                    key={time}
                    onClick={() => isAvailable && setSelectedTime(time)}
                    disabled={!isAvailable}
                    title={isAvailable ? undefined : "Orario già prenotato"}
                    className={`py-2 rounded-lg text-xs font-medium transition-all ${
                      selectedTime === time
                        ? "gradient-primary text-primary-foreground"
                        : isAvailable
                        ? "bg-card hover:bg-muted"
                        : "bg-muted/40 text-muted-foreground/40 line-through cursor-not-allowed"
                    }`}
                  >
                    {time}
                  </button>
                );
              })}
            </div>
            {!checkingAvailability && availableSlots.length === 0 && (
              <p className="text-xs text-muted-foreground mt-2">Nessun orario libero in questa data, prova un altro giorno.</p>
            )}
          </div>

          {/* Location Selection */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              <MapPin className="w-4 h-4 inline mr-1" /> Luogo
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {locationOptions.map(loc => (
                <button
                  key={loc.id}
                  onClick={() => setSelectedLocation(loc.id)}
                  className={`flex flex-col items-center py-3 px-2 rounded-xl transition-all ${
                    selectedLocation === loc.id
                      ? "gradient-primary text-primary-foreground"
                      : "bg-card hover:bg-muted"
                  }`}
                >
                  <loc.Icon className="w-6 h-6 mb-1" />
                  <span className="text-xs font-medium">{loc.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Note aggiuntive (opzionale)..."
            rows={2}
            className="w-full rounded-xl bg-card border border-border p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
          />

          {/* Summary & Confirm */}
          {selectedService && selectedTime && (
            <div className="rounded-2xl gradient-card border border-border p-4 shadow-card slide-up">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-muted-foreground">Totale</span>
                <span className="text-xl font-bold text-gradient-primary">
                  €{selectedServiceData?.price}
                </span>
              </div>
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="w-full py-3 rounded-xl gradient-primary text-primary-foreground font-bold shadow-glow disabled:opacity-50"
              >
                {loading ? "Confermando..." : "Conferma Prenotazione"}
              </button>
            </div>
          )}
        </div>
      )}
    </MobileLayout>
  );
}
