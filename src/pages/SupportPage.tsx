import MobileLayout from "@/components/layout/MobileLayout";
import { ArrowLeft, LifeBuoy, Send, CheckCircle2, Clock, MessageCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Ticket {
  id: string;
  subject: string;
  message: string;
  status: string;
  admin_reply: string | null;
  created_at: string;
}

const CATEGORIES = [
  { value: "general", label: "Generale" },
  { value: "payment", label: "Pagamenti" },
  { value: "booking", label: "Prenotazioni" },
  { value: "technical", label: "Problema tecnico" },
  { value: "account", label: "Account" },
];

export default function SupportPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("general");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (user) loadTickets();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadTickets = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("support_tickets")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setTickets(data || []);
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!user) { navigate("/auth"); return; }
    if (!subject.trim() || !message.trim()) { toast.error("Compila oggetto e messaggio"); return; }
    setSending(true);
    const { error } = await supabase.from("support_tickets").insert({
      user_id: user.id,
      subject: subject.trim().slice(0, 150),
      message: message.trim().slice(0, 2000),
      category,
    });
    setSending(false);
    if (error) { toast.error("Errore nell'invio, riprova"); return; }
    toast.success("Richiesta inviata! Ti risponderemo presto 💬");
    setSubject(""); setMessage("");
    loadTickets();
  };

  const statusLabel: Record<string, { label: string; color: string; icon: any }> = {
    open: { label: "In attesa", color: "text-amber-500 bg-amber-500/10", icon: Clock },
    in_progress: { label: "In lavorazione", color: "text-blue-500 bg-blue-500/10", icon: MessageCircle },
    resolved: { label: "Risolto", color: "text-emerald-500 bg-emerald-500/10", icon: CheckCircle2 },
  };

  return (
    <MobileLayout>
      <div className="min-h-screen bg-background pb-24">
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border/50 px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2"><ArrowLeft className="w-5 h-5" /></button>
          <div className="flex items-center gap-2">
            <LifeBuoy className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold">Assistenza</h1>
          </div>
        </div>

        <div className="p-4 space-y-4">
          <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-3">
            <h3 className="font-semibold text-sm">Hai un problema? Scrivicelo</h3>
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="w-full h-10 rounded-xl bg-background border border-border px-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30">
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <input value={subject} onChange={e => setSubject(e.target.value)}
              placeholder="Oggetto (breve)" maxLength={150}
              className="w-full h-10 rounded-xl bg-background border border-border px-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
            <textarea value={message} onChange={e => setMessage(e.target.value)}
              placeholder="Descrivi il problema con più dettagli possibili..." rows={4} maxLength={2000}
              className="w-full rounded-xl bg-background border border-border px-4 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary/30" />
            <button onClick={handleSubmit} disabled={sending}
              className="w-full h-11 rounded-xl gradient-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
              <Send className="w-4 h-4" /> {sending ? "Invio..." : "Invia richiesta"}
            </button>
          </div>

          {tickets.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-semibold text-sm px-1">Le tue richieste</h3>
              {tickets.map(t => {
                const s = statusLabel[t.status] || statusLabel.open;
                const StatusIcon = s.icon;
                return (
                  <div key={t.id} className="p-4 rounded-2xl bg-card border border-border/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-sm">{t.subject}</h4>
                      <span className={`text-xs font-medium px-2 py-1 rounded-full flex items-center gap-1 ${s.color}`}>
                        <StatusIcon className="w-3 h-3" /> {s.label}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{t.message}</p>
                    {t.admin_reply && (
                      <div className="mt-2 p-3 rounded-xl bg-primary/5 border border-primary/20">
                        <p className="text-xs font-semibold text-primary mb-1">Risposta del team:</p>
                        <p className="text-sm">{t.admin_reply}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!loading && tickets.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Nessuna richiesta inviata finora.</p>
          )}
        </div>
      </div>
    </MobileLayout>
  );
}
