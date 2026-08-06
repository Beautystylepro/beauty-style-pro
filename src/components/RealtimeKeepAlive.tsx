import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { RealtimeChannel } from "@supabase/supabase-js";

// CAUSA TROVATA nei log del servizio in tempo reale: il "motore" che
// fa funzionare chiamate e dirette (Supabase Realtime) si SPEGNE da
// solo dopo un periodo senza nessuno collegato, per risparmiare
// risorse — e deve riaccendersi da zero (mezzo secondo o più) ogni
// volta che qualcuno prova a collegarsi di nuovo. Se quel momento di
// "risveglio" capita proprio mentre parte una chiamata o una diretta,
// i primi segnali essenziali (squillo, offerta video) rischiano di
// perdersi nella finestra di ritardo.
//
// BUG TROVATO nella prima versione di questo componente: si iscriveva
// al canale ma non registrava MAI una presenza attiva (mancava
// channel.track(...)) — una sottoscrizione passiva che probabilmente
// non contava come "utente davvero connesso" per il sistema, quindi
// non impediva lo spegnimento. Corretto: ora registra attivamente la
// presenza e la rinnova ogni 20 secondi, generando vero traffico
// continuo che il servizio non può ignorare.
export default function RealtimeKeepAlive() {
  const { user } = useAuth();
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!user) {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      return;
    }

    const channel = supabase.channel(`keep-alive-${user.id}`, {
      config: { presence: { key: user.id } },
    });

    let heartbeat: number | null = null;

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({ online_at: new Date().toISOString() });
        heartbeat = window.setInterval(() => {
          void channel.track({ online_at: new Date().toISOString() });
        }, 20000);
      }
    });

    channelRef.current = channel;

    return () => {
      if (heartbeat) clearInterval(heartbeat);
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [user]);

  return null;
}
