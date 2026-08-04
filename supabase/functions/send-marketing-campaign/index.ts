import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Invia una campagna marketing REALE ai clienti veri del professionista
// (da prenotazioni completate, non una lista finta), solo se ha un
// abbonamento Pro/Business/Premium attivo. Le email partono davvero
// tramite Resend se configurato; se non ancora configurato, risponde
// onestamente invece di fingere di aver inviato qualcosa.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const authed = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await authed.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const user = userData.user;

    // Solo abbonamenti Pro/Business/Premium possono inviare campagne
    const { data: sub } = await admin
      .from("user_subscriptions")
      .select("status, subscription_plans(slug)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    const planSlug = (sub as any)?.subscription_plans?.slug;
    if (!planSlug || !["pro", "business", "premium"].includes(planSlug)) {
      return new Response(JSON.stringify({ error: "SUBSCRIPTION_REQUIRED: Le campagne marketing richiedono un abbonamento Pro, Business o Premium attivo" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { channel, subject, message } = await req.json();
    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "Messaggio mancante" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Lista clienti VERA: chi ha davvero prenotato con questo professionista
    const { data: pro } = await admin.from("professionals").select("id").eq("user_id", user.id).maybeSingle();
    if (!pro) {
      return new Response(JSON.stringify({ error: "Profilo professionale richiesto" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: bookingClients } = await admin
      .from("bookings")
      .select("client_id")
      .eq("professional_id", pro.id);
    const clientIds = Array.from(new Set((bookingClients || []).map((b: any) => b.client_id)));

    if (clientIds.length === 0) {
      return new Response(JSON.stringify({ error: "Nessun cliente reale trovato (nessuna prenotazione ancora)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: campaign, error: campaignError } = await admin.from("marketing_campaigns").insert({
      sender_id: user.id, channel, subject: subject || null, message,
      status: "sending", recipient_count: clientIds.length,
    }).select("id").single();
    if (campaignError || !campaign) throw campaignError;

    if (channel === "whatsapp") {
      // Onesto: nessun account WhatsApp Business reale collegato ancora
      await admin.from("marketing_campaigns").update({ status: "failed" }).eq("id", campaign.id);
      return new Response(JSON.stringify({
        error: "WHATSAPP_NOT_CONFIGURED: L'invio WhatsApp richiede un account WhatsApp Business collegato (Twilio o Meta) — non ancora configurato",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      await admin.from("marketing_campaigns").update({ status: "failed" }).eq("id", campaign.id);
      return new Response(JSON.stringify({
        error: "EMAIL_NOT_CONFIGURED: L'invio email richiede un account Resend collegato — non ancora configurato",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: authUsers } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const emailMap = new Map((authUsers?.users || []).map((u: any) => [u.id, u.email]));
    const recipientEmails = clientIds.map((id) => emailMap.get(id)).filter(Boolean) as string[];

    let sentCount = 0;
    for (const email of recipientEmails) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "STYLE <onboarding@resend.dev>",
            to: [email],
            subject: subject || "Novità dal tuo salone",
            text: message,
          }),
        });
        if (res.ok) sentCount++;
      } catch { /* continue with next recipient */ }
    }

    await admin.from("marketing_campaigns").update({
      status: sentCount > 0 ? "sent" : "failed", sent_count: sentCount, sent_at: new Date().toISOString(),
    }).eq("id", campaign.id);

    return new Response(JSON.stringify({ success: true, sentCount, totalRecipients: recipientEmails.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-marketing-campaign error", e);
    return new Response(JSON.stringify({ error: "Errore interno" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
