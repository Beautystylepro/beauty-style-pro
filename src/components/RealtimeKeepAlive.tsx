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
// Questo componente tiene SEMPRE viva una connessione minima finché
// l'utente ha l'app aperta — così il motore non si spegne mai nel
// momento sbagliato. Montato una sola volta, per tutta l'app.
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

    const channel = supabase
      .channel(`keep-alive-${user.id}`)
      .on("presence", { event: "sync" }, () => { /* nessuna azione necessaria, serve solo a tenere viva la connessione */ })
      .subscribe();
    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [user]);

  return null;
}
