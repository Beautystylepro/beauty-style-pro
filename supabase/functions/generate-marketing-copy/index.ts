import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireUser } from "../_shared/auth-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Genera testo di marketing (email o WhatsApp) con Claude, basato sul
// tipo di attività e l'obiettivo indicato dal professionista — non un
// template fisso, un testo reale scritto su misura. Supporta anche la
// modalità "migliora": se l'utente ha già scritto una bozza, Claude la
// corregge e rende professionale invece di riscriverla da zero.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    try { await requireUser(req); } catch (r) { if (r instanceof Response) return r; throw r; }
    const { channel, goal, businessName, businessType, tone, existingText } = await req.json();
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI non disponibile" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!goal && !existingText) {
      return new Response(JSON.stringify({ error: "Descrivi l'obiettivo o scrivi un testo da migliorare" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isEmail = channel === "email";
    const isImprove = !!existingText && existingText.trim().length > 0;
    const systemPrompt = isImprove
      ? `Sei un copywriter esperto di marketing per il settore beauty & wellness in Italia. Il proprietario ha già scritto una bozza di testo per una campagna ${isEmail ? "email" : "WhatsApp"} — il tuo compito è MIGLIORARLA, non riscriverla da zero: correggi errori grammaticali/ortografici, rendi il tono più professionale e persuasivo, mantieni le informazioni concrete che l'utente ha scritto (sconti, date, dettagli specifici) senza inventarne di nuove o cambiarne il significato. Attività: "${businessName || "il salone"}" (${businessType || "beauty"}). ${isEmail ? "Se manca, suggerisci anche un oggetto accattivante (max 60 caratteri)." : "Massimo 300 caratteri, emoji con moderazione."}`
      : `Sei un copywriter esperto di marketing per il settore beauty & wellness in Italia. Scrivi in italiano, tono ${tone || "amichevole e professionale"}. Attività: "${businessName || "il salone"}" (${businessType || "beauty"}). Canale: ${isEmail ? "email" : "messaggio WhatsApp breve"}. ${isEmail ? "Scrivi un oggetto accattivante (max 60 caratteri) e un corpo email persuasivo ma non aggressivo, massimo 120 parole, con una call-to-action chiara." : "Scrivi un messaggio WhatsApp breve e diretto, massimo 300 caratteri, con emoji con moderazione, tono colloquiale."} Non inventare sconti/numeri specifici se non forniti dall'utente.`;

    const userMessage = isImprove
      ? `Bozza da migliorare:\n\n${existingText}${goal ? `\n\nNota aggiuntiva dell'utente: ${goal}` : ""}`
      : goal;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
        tools: [{
          name: "generate_copy",
          description: "Generate or improve marketing copy",
          input_schema: {
            type: "object",
            properties: {
              subject: { type: "string", description: "Email subject line, omit for WhatsApp" },
              body: { type: "string" },
            },
            required: ["body"],
          },
        }],
        tool_choice: { type: "tool", name: "generate_copy" },
      }),
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: "Errore nella generazione" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const result = await response.json();
    const toolUse = result.content?.find((b: { type: string }) => b.type === "tool_use");
    const copy = toolUse?.input || { body: "" };

    return new Response(JSON.stringify(copy), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-marketing-copy error", e);
    return new Response(JSON.stringify({ error: "Errore interno" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
