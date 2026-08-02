import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireUser } from "../_shared/auth-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    try { await requireUser(req); } catch (r) { if (r instanceof Response) return r; throw r; }
    const { messages, message } = await req.json();
    // Two callers send a single "message" string (ContentCalendarPage,
    // WebsiteGeneratorPage), one sends a "messages" array
    // (StyleReplicatorPanel) — support both instead of silently sending
    // Claude an empty conversation for the single-message callers.
    const finalMessages = messages || (message ? [{ role: "user", content: message }] : []);
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");

    if (!apiKey) {
      return jsonResponse({ error: "AI non configurata" }, 500);
    }

    const systemPrompt = `Sei "Beauty AI", l'assistente virtuale di Style, la super app italiana per il settore beauty & wellness.

Il tuo ruolo:
- Consigliare tagli, colori, trattamenti e prodotti personalizzati
- Suggerire routine di skincare e haircare
- Aiutare a scegliere servizi e professionisti
- Rispondere in italiano in modo amichevole, professionale e conciso
- Usare emoji con moderazione per rendere le risposte piacevoli
- Se non sai qualcosa, suggerisci di consultare un professionista sulla piattaforma

Non parlare mai di altre app o competitor. Promuovi sempre l'ecosistema Style.
Rispondi in massimo 3-4 paragrafi brevi.`;

    if (finalMessages.length === 0) {
      return jsonResponse({ error: "Nessun messaggio fornito" }, 400);
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
        max_tokens: 800,
        temperature: 0.7,
        system: systemPrompt,
        messages: finalMessages.map((m: { role: string; content: string }) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        })),
      }),
    });

    const FALLBACK_CONTENT = "Ciao! 👋 Al momento il servizio AI è temporaneamente offline. Puoi consultare i nostri professionisti su /stylists per consigli personalizzati. Tornerò presto! ✨";

    if (!response.ok) {
      if (response.status === 429) {
        return jsonResponse({ content: FALLBACK_CONTENT }, 429);
      }
      if (response.status === 402) {
        return jsonResponse({ content: FALLBACK_CONTENT });
      }
      console.error("Anthropic API error:", response.status, await response.text());
      return jsonResponse({ content: FALLBACK_CONTENT });
    }

    const result = await response.json();
    const content = result.content?.[0]?.text || "Mi dispiace, non riesco a rispondere.";

    return jsonResponse({ content });
  } catch (error: unknown) {
    console.error("AI assistant error:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
