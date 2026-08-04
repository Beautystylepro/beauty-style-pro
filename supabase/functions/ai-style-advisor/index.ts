import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireUser } from "../_shared/auth-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Stella guarda davvero la foto (Claude ha visione reale) e consiglia
// quale taglio/colore/stile si addice di più alla persona, citando
// caratteristiche reali visibili nella foto (forma viso, colore/tipo
// capelli attuale) e tendenze del momento — non un testo generico.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    try { await requireUser(req); } catch (r) { if (r instanceof Response) return r; throw r; }
    const { imageBase64, mimeType, question } = await req.json();
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI non disponibile" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "Foto richiesta" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 700,
        system: `Sei Stella, consulente di immagine e hair stylist esperta. Guarda con attenzione la foto reale della persona (forma del viso, capelli attuali, colorito) e dai un consiglio VERO e specifico, non generico — devi citare caratteristiche che vedi davvero nella foto. Suggerisci 2-3 opzioni concrete di taglio/colore/stile adatte a quella persona specifica, menzionando anche cosa è di tendenza nel 2026. Tono amichevole da amica esperta, non da manuale. Massimo 150 parole. Rispondi in italiano.`,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mimeType || "image/jpeg", data: imageBase64 } },
            { type: "text", text: question || "Che taglio/colore mi consigli guardando questa foto?" },
          ],
        }],
      }),
    });

    if (!response.ok) {
      console.error("ai-style-advisor: Anthropic error", response.status, await response.text());
      return new Response(JSON.stringify({ error: "Errore nell'analisi della foto" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const advice = result.content?.find((b: { type: string }) => b.type === "text")?.text || "Non sono riuscita ad analizzare la foto, riprova.";

    return new Response(JSON.stringify({ advice }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-style-advisor error", e);
    return new Response(JSON.stringify({ error: "Errore interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
