import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireUser } from "../_shared/auth-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    try { await requireUser(req); } catch (r) { if (r instanceof Response) return r; throw r; }
    const { audioUrl, audioBase64, mimeType, targetLanguage } = await req.json();
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

    let audioB64: string;
    let contentType = mimeType || "audio/webm";

    if (audioBase64) {
      audioB64 = audioBase64;
    } else if (audioUrl) {
      // Validate URL against allow-list to prevent SSRF
      let parsed: URL;
      try { parsed = new URL(audioUrl); } catch {
        return new Response(JSON.stringify({ error: "Invalid audioUrl" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const allowedHosts = [
        new URL(Deno.env.get("SUPABASE_URL") ?? "http://localhost").host,
      ];
      if (parsed.protocol !== "https:" || !allowedHosts.includes(parsed.host)) {
        return new Response(JSON.stringify({ error: "audioUrl host not allowed" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const r = await fetch(parsed.toString());
      if (!r.ok) throw new Error("Cannot fetch audio");
      contentType = r.headers.get("content-type") || contentType;
      const bytes = new Uint8Array(await r.arrayBuffer());
      audioB64 = btoa(String.fromCharCode(...bytes));
    } else {
      return new Response(JSON.stringify({ error: "audioUrl or audioBase64 required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Transcribe using Gemini's native audio understanding (Claude has no
    // audio input support, so this step always uses Gemini regardless of
    // which provider handles the rest of the app's text/reasoning tasks).
    const sttResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: "Transcribe this audio verbatim. Return ONLY the transcribed text, nothing else — no commentary, no quotes." },
              { inline_data: { mime_type: contentType, data: audioB64 } },
            ],
          }],
        }),
      }
    );

    if (!sttResp.ok) {
      const t = await sttResp.text();
      console.error("STT error", sttResp.status, t);
      return new Response(JSON.stringify({ error: "Transcription failed" }), {
        status: sttResp.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sttData = await sttResp.json();
    const transcript: string = sttData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

    let translated = transcript;
    if (targetLanguage && transcript.trim().length > 0 && ANTHROPIC_API_KEY) {
      const langMap: Record<string, string> = {
        it: "Italian", en: "English", es: "Spanish", fr: "French",
        de: "German", pt: "Portuguese", ar: "Arabic", zh: "Chinese",
        ja: "Japanese", ko: "Korean", ru: "Russian",
      };
      const targetName = langMap[targetLanguage] || targetLanguage;
      const trResp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 500,
          system: `Translate to ${targetName}. Return ONLY the translation. If already in ${targetName}, return as-is.`,
          messages: [{ role: "user", content: transcript }],
        }),
      });
      if (trResp.ok) {
        const trData = await trResp.json();
        translated = trData.content?.[0]?.text?.trim() || transcript;
      }
    }

    return new Response(JSON.stringify({ transcript, translated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("voice-transcribe error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});