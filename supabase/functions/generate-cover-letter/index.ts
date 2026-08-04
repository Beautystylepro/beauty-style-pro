import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireUser } from "../_shared/auth-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Scrive una vera lettera di candidatura personalizzata, basata
// sull'annuncio reale e sul profilo reale del candidato — non un
// testo generico, cita davvero le competenze/esperienza fornite.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    try { await requireUser(req); } catch (r) { if (r instanceof Response) return r; throw r; }
    const { jobTitle, jobDescription, companyName, candidateName, candidateBio, candidateSkills } = await req.json();
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI non disponibile" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!jobTitle) {
      return new Response(JSON.stringify({ error: "Dati annuncio mancanti" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 400,
        system: `Scrivi una breve lettera di presentazione in italiano per una candidatura di lavoro nel settore beauty, massimo 100 parole, tono professionale ma non freddo. Usa SOLO le informazioni reali fornite sul candidato — non inventare esperienze o competenze non menzionate. Se le informazioni sul candidato sono scarse, scrivi qualcosa di più generico ma comunque sincero, senza inventare dettagli falsi.`,
        messages: [{
          role: "user",
          content: `Annuncio: "${jobTitle}"${companyName ? ` presso ${companyName}` : ""}\nDescrizione annuncio: ${jobDescription || "non specificata"}\n\nCandidato: ${candidateName || "il candidato"}\nBio/esperienza: ${candidateBio || "non specificata"}\nCompetenze: ${candidateSkills || "non specificate"}\n\nScrivi la lettera di presentazione.`,
        }],
      }),
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: "Errore nella generazione" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const result = await response.json();
    const text = result.content?.find((b: { type: string }) => b.type === "text")?.text || "";

    return new Response(JSON.stringify({ coverLetter: text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-cover-letter error", e);
    return new Response(JSON.stringify({ error: "Errore interno" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
