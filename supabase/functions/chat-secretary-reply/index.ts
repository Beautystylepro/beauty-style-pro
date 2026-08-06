import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Auto-risponde a un messaggio in chat per conto del destinatario, quando
// questi ha attivato la "Modalità Segretaria". Innescata dal trigger
// on_message_insert_secretary su ogni nuovo messaggio in entrata.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const secret = req.headers.get("x-internal-secret");
    const expected = Deno.env.get("INTERNAL_SECRET");
    if (!expected || secret !== expected) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "AI non configurata" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { conversation_id, recipient_id, sender_id, incoming_message } = await req.json();
    if (!conversation_id || !recipient_id || !sender_id || !incoming_message) {
      return new Response(JSON.stringify({ error: "missing_params" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const [{ data: recipientProfile }, { data: senderProfile }, { data: secretarySettings }, { data: pro }] = await Promise.all([
      supabase.from("profiles").select("display_name, user_type, city, bio").eq("user_id", recipient_id).maybeSingle(),
      supabase.from("profiles").select("display_name").eq("user_id", sender_id).maybeSingle(),
      supabase.from("chat_secretary_settings").select("custom_instructions").eq("user_id", recipient_id).maybeSingle(),
      supabase.from("professionals").select("business_name, specialty, city").eq("user_id", recipient_id).maybeSingle(),
    ]);

    // Recent conversation history for context (last 10 messages)
    const { data: history } = await supabase
      .from("messages")
      .select("sender_id, content, created_at")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: false })
      .limit(10);

    const chatHistory = (history || []).reverse().map(m => ({
      role: m.sender_id === recipient_id ? "assistant" : "user" as const,
      content: m.content,
    }));

    const ownerName = recipientProfile?.display_name || "l'utente";
    const bizInfo = pro ? `Attività: ${pro.business_name || ''} (${pro.specialty || 'beauty'}) a ${pro.city || recipientProfile?.city || ''}` : '';

    const systemPrompt = `Sei la segretaria virtuale di ${ownerName} su Style, l'app beauty italiana. ${ownerName} ha attivato la modalità segretaria: rispondi ai messaggi in chat al posto suo quando non è disponibile.
${bizInfo}
${secretarySettings?.custom_instructions ? `Istruzioni personalizzate di ${ownerName}: ${secretarySettings.custom_instructions}` : ''}

REGOLE:
- Rispondi in italiano, tono professionale ma caldo, breve (max 2-3 frasi)
- Presentati come assistente solo alla PRIMA risposta della conversazione, poi rispondi naturalmente
- Se chiedono disponibilità/appuntamenti, invita a prenotare dall'app o dì che ${ownerName} confermerà a breve
- Non inventare informazioni che non hai (prezzi esatti, orari specifici) — se non lo sai, dì che ${ownerName} risponderà con i dettagli
- Non prometterle mai nulla di vincolante a nome del titolare, resta generica e cortese`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 300,
        system: systemPrompt,
        messages: chatHistory.length > 0 ? chatHistory : [{ role: "user", content: incoming_message }],
      }),
    });

    if (!response.ok) {
      console.error("chat-secretary-reply: Anthropic error", response.status, await response.text());
      return new Response(JSON.stringify({ sent: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const replyText = result.content?.[0]?.text?.trim();
    if (!replyText) {
      return new Response(JSON.stringify({ sent: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("messages").insert({
      conversation_id,
      sender_id: recipient_id,
      content: replyText,
      is_ai_reply: true,
    });

    await supabase.from("conversations").update({
      last_message: replyText,
      last_message_at: new Date().toISOString(),
    }).eq("id", conversation_id);

    return new Response(JSON.stringify({ sent: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("chat-secretary-reply error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "error" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
