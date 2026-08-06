import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import MobileLayout from "@/components/layout/MobileLayout";
import { ArrowLeft, Calendar, Clock, MapPin, MessageCircle, RotateCcw, Star, X } from "lucide-react";
import { toast } from "sonner";

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (id) fetchBooking();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchBooking = async () => {
    const { data, error } = await supabase
      .from("bookings")
      .select("*, professionals(business_name, city, user_id), services(name, price, duration_minutes)")
      .eq("id", id!)
      .maybeSingle();
    if (!error) setBooking(data);
    setLoading(false);
  };

  // BUG TROVATO: mancava del tutto un modo per il PROFESSIONISTA di
  // confermare o rifiutare una richiesta in arrivo — poteva solo
  // vederne il conteggio nella dashboard, senza nessuna azione reale
  // possibile. Ogni prenotazione restava "in attesa" per sempre.
  const isProfessionalView = booking?.professionals?.user_id === user?.id;

  const handleConfirm = async () => {
    if (!booking) return;
    setConfirming(true);
    const { error } = await supabase
      .from("bookings")
      .update({ status: "confirmed" })
      .eq("id", booking.id);
    if (error) {
      toast.error("Errore nella conferma");
    } else {
      toast.success("Prenotazione confermata ✓");
      setBooking({ ...booking, status: "confirmed" });
      await supabase.rpc("notify_booking_status_change", {
        _booking_id: booking.id,
        _title: "Prenotazione Confermata ✅",
        _message: `Il tuo appuntamento del ${booking.booking_date} è stato confermato dal professionista.`,
      });
    }
    setConfirming(false);
  };

  const handleReject = async () => {
    if (!booking) return;
    setCancelling(true);
    const { error } = await supabase
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", booking.id);
    if (error) {
      toast.error("Errore nel rifiuto");
    } else {
      toast.success("Richiesta rifiutata");
      setBooking({ ...booking, status: "cancelled" });
      await supabase.rpc("notify_booking_status_change", {
        _booking_id: booking.id,
        _title: "Richiesta non accettata",
        _message: `Il professionista non può confermare l'appuntamento del ${booking.booking_date}. Prova un altro orario.`,
      });
    }
    setCancelling(false);
  };

  const handleCancel = async () => {
    if (!booking) return;
    setCancelling(true);
    const { error } = await supabase
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", booking.id);
    if (error) toast.error("Errore nella cancellazione");
    else {
      toast.success("Prenotazione cancellata");
      setBooking({ ...booking, status: "cancelled" });
      // Avvisa l'altra parte: prima nessuno veniva notificato di un
      // annullamento, l'altra persona lo scopriva solo aprendo l'app.
      await supabase.rpc("notify_booking_status_change", {
        _booking_id: booking.id,
        _title: "Prenotazione Annullata",
        _message: `L'appuntamento del ${booking.booking_date} è stato annullato.`,
      });
    }
    setCancelling(false);
  };

  const statusConfig: Record<string, { color: string; bg: string; label: string }> = {
    pending: { color: "text-amber-500", bg: "bg-amber-500/15", label: "In Attesa" },
    confirmed: { color: "text-emerald-500", bg: "bg-emerald-500/15", label: "Confermata" },
    completed: { color: "text-primary", bg: "bg-primary/15", label: "Completata" },
    cancelled: { color: "text-destructive", bg: "bg-destructive/15", label: "Cancellata" },
  };

  if (loading) {
    return (
      <MobileLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </MobileLayout>
    );
  }

  if (!booking) {
    return (
      <MobileLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
          <p className="text-muted-foreground">Prenotazione non trovata</p>
          <button onClick={() => navigate(-1)} className="mt-4 text-primary text-sm font-semibold">Indietro</button>
        </div>
      </MobileLayout>
    );
  }

  const status = statusConfig[booking.status] || statusConfig.pending;

  return (
    <MobileLayout>
      <header className="sticky top-0 z-40 glass px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-display font-bold">Dettaglio Prenotazione</h1>
      </header>

      <div className="px-4 py-4 space-y-5">
        {/* Status */}
        <div className="flex justify-center">
          <span className={`px-5 py-2 rounded-full text-sm font-bold ${status.color} ${status.bg}`}>
            {status.label}
          </span>
        </div>

        {/* Service Card */}
        <div className="rounded-2xl bg-card border border-border p-4">
          <h2 className="text-lg font-bold mb-1">{booking.services?.name || "Servizio"}</h2>
          <p className="text-sm text-muted-foreground mb-3">
            {booking.services?.duration_minutes || 60} minuti
          </p>
          <p className="text-2xl font-bold text-primary">€{booking.total_price || booking.services?.price || 0}</p>
        </div>

        {/* Details */}
        <div className="rounded-2xl bg-card border border-border divide-y divide-border">
          <div className="flex items-center gap-3 p-4">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
              <Calendar className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Data</p>
              <p className="text-sm font-semibold">{booking.booking_date}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
              <Clock className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Orario</p>
              <p className="text-sm font-semibold">{booking.start_time}{booking.end_time ? ` - ${booking.end_time}` : ""}</p>
            </div>
          </div>
          {booking.professionals && (
            <div className="flex items-center gap-3 p-4">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                <MapPin className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Professionista</p>
                <p className="text-sm font-semibold">{booking.professionals.business_name}</p>
                {booking.professionals.city && (
                  <p className="text-xs text-muted-foreground">{booking.professionals.city}</p>
                )}
              </div>
            </div>
          )}
          {booking.notes && (
            <div className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Note</p>
              <p className="text-sm">{booking.notes}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-3">
          {booking.status === "confirmed" && (
            <>
              <button
                onClick={() => navigate("/chat")}
                className="w-full h-12 rounded-xl gradient-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-4 h-4" /> Chatta col Professionista
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="w-full h-12 rounded-xl bg-card border-2 border-destructive text-destructive font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <X className="w-4 h-4" /> {cancelling ? "Cancellando..." : "Cancella Prenotazione"}
              </button>
            </>
          )}

          {booking.status === "pending" && isProfessionalView && (
            <>
              <button
                onClick={handleConfirm}
                disabled={confirming}
                className="w-full h-12 rounded-xl gradient-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {confirming ? "Confermando..." : "✓ Conferma Prenotazione"}
              </button>
              <button
                onClick={handleReject}
                disabled={cancelling}
                className="w-full h-12 rounded-xl bg-card border-2 border-destructive text-destructive font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <X className="w-4 h-4" /> {cancelling ? "..." : "Rifiuta"}
              </button>
            </>
          )}

          {booking.status === "pending" && !isProfessionalView && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="w-full h-12 rounded-xl bg-card border-2 border-destructive text-destructive font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <X className="w-4 h-4" /> {cancelling ? "Cancellando..." : "Cancella Prenotazione"}
            </button>
          )}

          {booking.status === "completed" && (
            <>
              <button
                onClick={() => navigate(`/booking`)}
                className="w-full h-12 rounded-xl gradient-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2"
              >
                <Star className="w-4 h-4" /> Lascia una Recensione
              </button>
              <button
                onClick={() => navigate(`/booking`)}
                className="w-full h-12 rounded-xl bg-card border border-border font-semibold text-sm flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" /> Prenota di Nuovo
              </button>
            </>
          )}

          {booking.status === "cancelled" && (
            <button
              onClick={() => navigate(`/booking`)}
              className="w-full h-12 rounded-xl gradient-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" /> Prenota di Nuovo
            </button>
          )}
        </div>
      </div>
    </MobileLayout>
  );
}
