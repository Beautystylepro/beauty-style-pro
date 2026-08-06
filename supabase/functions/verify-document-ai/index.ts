import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Verifica automatica del documento d'identità tramite Claude
// (visione reale) al posto dell'attesa di un controllo umano di
// 24-48h. Claude guarda davvero l'immagine caricata, valuta se
// sembra un documento ufficiale autentico e leggibile, e confronta il
// nome sul documento con quello dichiarato nel profilo. In caso di
// dubbio genuino (foto poco chiara, nome non corrispondente, dati
// insufficienti) NON approva da sola — lascia il caso a revisione
// umana invece di rischiare un errore, come rete di sicurezza.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const authed = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await authed.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const user = userData.user;

    const { requestId, fullName, docType } = await req.json();
    if (!requestId) {
      return new Response(JSON.stringify({ error: "requestId mancante" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });

    const { data: reqRow } = await admin.from("verification_requests").select("*").eq("id", requestId).eq("user_id", user.id).maybeSingle();
    if (!reqRow) {
      return new Response(JSON.stringify({ error: "Richiesta non trovata" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const docUrls: string[] = reqRow.document_urls || [];
    if (docUrls.length === 0) {
      return new Response(JSON.stringify({ error: "Nessun documento da verificare" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Scarica la prima immagine del documento dal bucket privato
    const { data: fileData, error: dlError } = await admin.storage.from("documents").download(docUrls[0]);
    if (dlError || !fileData) {
      return new Response(JSON.stringify({ error: "Impossibile leggere il documento caricato" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const arrayBuffer = await fileData.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    const mimeType = fileData.type || "image/jpeg";

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI non disponibile" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 500,
        system: `Sei un sistema di verifica documenti d'identità per una piattaforma beauty & wellness italiana. Guarda l'immagine del documento (${docType || "documento d'identità"}) e valuta con attenzione: 1) sembra un documento ufficiale reale e leggibile (non una foto scura, tagliata, o palesemente non un documento)? 2) il nome leggibile sul documento corrisponde ragionevolmente a "${fullName}"? Sii PRUDENTE: approva SOLO se sei ragionevolmente sicuro. In caso di dubbio, incertezza, foto poco chiara, o nome non corrispondente, NON approvare — lascia a un controllo umano. Non inventare mai dati che non vedi chiaramente nell'immagine.`,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mimeType, data: base64 } },
            { type: "text", text: "Valuta questo documento." },
          ],
        }],
        tools: [{
          name: "verification_result",
          description: "Risultato della verifica del documento",
          input_schema: {
            type: "object",
            properties: {
              decision: { type: "string", enum: ["approve", "needs_human_review"] },
              reason: { type: "string", description: "Breve spiegazione della decisione" },
              extracted_name: { type: "string", description: "Nome letto sul documento, se leggibile" },
            },
            required: ["decision", "reason"],
          },
        }],
        tool_choice: { type: "tool", name: "verification_result" },
      }),
    });

    if (!response.ok) {
      console.error("verify-document-ai: Anthropic error", response.status, await response.text());
      return new Response(JSON.stringify({ error: "Errore nell'analisi" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const result = await response.json();
    const toolUse = result.content?.find((b: { type: string }) => b.type === "tool_use");
    const verdict = toolUse?.input || { decision: "needs_human_review", reason: "Analisi non riuscita" };

    if (verdict.decision === "approve") {
      await admin.from("verification_requests").update({
        status: "approved",
        admin_notes: `Verificato automaticamente da Stella AI: ${verdict.reason}`,
        reviewed_at: new Date().toISOString(),
      }).eq("id", requestId);
      await admin.from("profiles").update({ verification_status: "verified" }).eq("user_id", user.id);
    }

    return new Response(JSON.stringify({
      decision: verdict.decision,
      reason: verdict.reason,
      autoApproved: verdict.decision === "approve",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("verify-document-ai error", e);
    return new Response(JSON.stringify({ error: "Errore interno" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
