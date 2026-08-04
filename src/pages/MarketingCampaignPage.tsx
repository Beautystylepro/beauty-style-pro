import MobileLayout from "@/components/layout/MobileLayout";
import { ArrowLeft, Megaphone, Sparkles, Mail, MessageCircle, Send, Users, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function MarketingCampaignPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [channel, setChannel] = useState<"email" | "whatsapp">("email");
  const [goal, setGoal] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);

  const canMarket = profile?.user_type === "professional" || profile?.user_type === "business";

  const { data: campaigns } = useQuery({
    queryKey: ["marketing_campaigns", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("marketing_campaigns")
        .select("*")
        .eq("sender_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
  });

  const handleGenerate = async () => {
    if (!goal.trim()) {
      toast.error("Descrivi cosa vuoi comunicare (es: promozione sconto 20% weekend)");
      return;
    }
    setGenerating(true);
    const { data, error } = await supabase.functions.invoke("generate-marketing-copy", {
      body: {
        channel,
        goal,
        businessName: profile?.display_name,
        businessType: (profile as any)?.category || "beauty",
        tone: "amichevole",
      },
    });
    setGenerating(false);
    if (error || data?.error) {
      toast.error("Errore nella generazione del testo");
      return;
    }
    if (data.subject) setSubject(data.subject);
    setMessage(data.body || "");
  };

  const handleSend = async () => {
    if (!message.trim()) {
      toast.error("Scrivi o genera prima un messaggio");
      return;
    }
    setSending(true);
    const { data, error } = await supabase.functions.invoke("send-marketing-campaign", {
      body: { channel, subject, message },
    });
    setSending(false);

    if (error || data?.error) {
      const errMsg: string = data?.error || error?.message || "";
      if (errMsg.includes("SUBSCRIPTION_REQUIRED")) {
        toast.error("Le campagne richiedono un abbonamento Pro, Business o Premium", {
          action: { label: "Vedi piani", onClick: () => navigate("/subscriptions") },
        });
      } else if (errMsg.includes("WHATSAPP_NOT_CONFIGURED")) {
        toast.error("Invio WhatsApp non ancora attivo: serve collegare un account WhatsApp Business");
      } else if (errMsg.includes("EMAIL_NOT_CONFIGURED")) {
        toast.error("Invio email non ancora attivo: serve completare la configurazione email della piattaforma");
      } else if (errMsg.includes("Nessun cliente")) {
        toast.error("Non hai ancora clienti reali (nessuna prenotazione) a cui inviare");
      } else {
        toast.error("Errore nell'invio della campagna");
      }
      queryClient.invalidateQueries({ queryKey: ["marketing_campaigns", user?.id] });
      return;
    }

    toast.success(`Campagna inviata a ${data.sentCount} clienti su ${data.totalRecipients}! 📬`);
    setGoal(""); setSubject(""); setMessage("");
    queryClient.invalidateQueries({ queryKey: ["marketing_campaigns", user?.id] });
  };

  if (!canMarket) {
    return (
      <MobileLayout>
        <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
          <p className="text-sm text-muted-foreground">Solo professionisti e attività possono inviare campagne marketing.</p>
          <button onClick={() => navigate(-1)} className="mt-4 text-sm font-semibold text-primary">Torna indietro</button>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout>
      <div className="min-h-screen bg-background pb-24">
        <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-primary" aria-label="Indietro">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold">Marketing</h1>
          </div>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex gap-2">
            <button
              onClick={() => setChannel("email")}
              className={`flex-1 h-11 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 ${channel === "email" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              <Mail className="w-4 h-4" /> Email
            </button>
            <button
              onClick={() => setChannel("whatsapp")}
              className={`flex-1 h-11 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 ${channel === "whatsapp" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              <MessageCircle className="w-4 h-4" /> WhatsApp
            </button>
          </div>

          <div>
            <label className="text-xs font-semibold mb-1 block">Cosa vuoi comunicare?</label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={2}
              placeholder="Es: promozione 20% di sconto sui trattamenti colore questo weekend"
              className="w-full px-3 py-2 rounded-xl border border-border/50 bg-card text-sm"
            />
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="mt-2 w-full h-10 rounded-xl border border-primary/40 text-primary text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" /> {generating ? "Scrivo con Claude..." : "Genera testo con Claude"}
            </button>
          </div>

          {channel === "email" && (
            <div>
              <label className="text-xs font-semibold mb-1 block">Oggetto</label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-border/50 bg-card text-sm"
              />
            </div>
          )}

          <div>
            <label className="text-xs font-semibold mb-1 block">Messaggio</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              placeholder="Il testo apparirà qui — puoi modificarlo liberamente"
              className="w-full px-3 py-2 rounded-xl border border-border/50 bg-card text-sm"
            />
          </div>

          <button
            onClick={handleSend}
            disabled={sending || !message.trim()}
            className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Send className="w-4 h-4" /> {sending ? "Invio..." : "Invia ai tuoi clienti reali"}
          </button>

          {campaigns && campaigns.length > 0 && (
            <div>
              <h3 className="text-sm font-bold mb-2">Campagne recenti</h3>
              <div className="space-y-2">
                {campaigns.map((c: any) => (
                  <div key={c.id} className="rounded-xl border border-border/50 bg-card p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold flex items-center gap-1">
                        {c.channel === "email" ? <Mail className="w-3.5 h-3.5" /> : <MessageCircle className="w-3.5 h-3.5" />}
                        {c.subject || c.message.slice(0, 30)}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        c.status === "sent" ? "bg-primary/15 text-primary" : c.status === "failed" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"
                      }`}>{c.status}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {c.sent_count}/{c.recipient_count}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(c.created_at).toLocaleDateString("it-IT")}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </MobileLayout>
  );
}
