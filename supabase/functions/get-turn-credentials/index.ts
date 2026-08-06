import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireUser } from "../_shared/auth-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Le chiamate/dirette usavano credenziali TURN gratuite pubbliche
// (openrelayproject) — un servizio di terzi senza account, la cui
// affidabilità nel tempo non è garantita (verificato: richiede ormai
// una registrazione per funzionare stabilmente). Dato che l'account
// Twilio è già configurato con credito reale, questa funzione genera
// credenziali TURN vere e temporanee tramite il servizio ufficiale di
// Twilio (Network Traversal Service) — molto più affidabile su reti
// mobili e wifi restrittive.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    try { await requireUser(req); } catch (r) { if (r instanceof Response) return r; throw r; }

    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");

    if (!accountSid || !authToken) {
      console.error("get-turn-credentials: Twilio non configurato");
      return new Response(JSON.stringify({ error: "Twilio non configurato", fallback: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Tokens.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "Ttl=3600",
      }
    );

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("get-turn-credentials: Twilio error", resp.status, errText);
      return new Response(JSON.stringify({ error: `Errore Twilio (${resp.status})`, fallback: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    // data.ice_servers è già nel formato { urls, username, credential }[] atteso da RTCPeerConnection
    return new Response(JSON.stringify({ iceServers: data.ice_servers }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("get-turn-credentials error", e);
    return new Response(JSON.stringify({ error: "Errore interno", fallback: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
