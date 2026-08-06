import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Genera analisi predittive VERE, basate sui dati reali del professionista
// (prenotazioni, cancellazioni, incassi degli ultimi 90 giorni) — prima
// d'ora la pagina mostrava numeri fissi identici per ogni utente quando
// la tabella era vuota, presentati come previsioni AI personalizzate.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "AI non configurata" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Non autenticato");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Autenticazione fallita");
    const userId = userData.user.id;

    const { data: pro } = await supabase.from("professionals").select("id, business_name, specialty, city").eq("user_id", userId).maybeSingle();
    if (!pro) {
      return new Response(JSON.stringify({ error: "Profilo professionale richiesto" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const [bookingsRes, cancelledRes, revenueRes] = await Promise.all([
      supabase.from("bookings").select("id, booking_date, status, total_price, client_id, created_at")
        .eq("professional_id", pro.id).gte("created_at", ninetyDaysAgo).order("created_at", { ascending: false }),
      supabase.from("bookings").select("id", { count: "exact", head: true })
        .eq("professional_id", pro.id).eq("status", "cancelled").gte("created_at", ninetyDaysAgo),
      supabase.from("transactions").select("amount, created_at").eq("user_id", userId)
        .eq("type", "credit").gte("created_at", ninetyDaysAgo),
    ]);

    const bookings = bookingsRes.data || [];
    if (bookings.length < 3) {
      return new Response(JSON.stringify({
        insufficientData: true,
        message: "Servono almeno 3 prenotazioni negli ultimi 90 giorni per generare un'analisi affidabile. Continua a lavorare sulla piattaforma e torna qui tra qualche settimana.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Repeat-client rate, a real churn signal
    const clientCounts: Record<string, number> = {};
    for (const b of bookings) {
      if (b.client_id) clientCounts[b.client_id] = (clientCounts[b.client_id] || 0) + 1;
    }
    const uniqueClients = Object.keys(clientCounts).length;
    const repeatClients = Object.values(clientCounts).filter(c => c > 1).length;

    const dayOfWeekCounts: Record<number, number> = {};
    for (const b of bookings) {
      const d = new Date(b.booking_date).getDay();
      dayOfWeekCounts[d] = (dayOfWeekCounts[d] || 0) + 1;
    }

    const totalRevenue = (revenueRes.data || []).reduce((s, t) => s + Number(t.amount || 0), 0);

    const dataSummary = {
      business_name: pro.business_name,
      specialty: pro.specialty,
      total_bookings_90d: bookings.length,
      unique_clients: uniqueClients,
      repeat_clients: repeatClients,
      cancelled_bookings_90d: cancelledRes.count || 0,
      total_revenue_90d: totalRevenue,
      bookings_by_weekday: dayOfWeekCounts,
    };

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1500,
        system: `Sei un analista di business per professionisti beauty. Analizza SOLO i dati reali forniti, senza inventare numeri. Se un dato non è sufficiente per una previsione affidabile, assegna una confidence_score bassa (30-50) e dillo esplicitamente nella description. Rispondi con tool call.`,
        messages: [
          { role: "user", content: `Dati reali degli ultimi 90 giorni:\n${JSON.stringify(dataSummary, null, 2)}\n\nGenera 2-3 insight di business basati SOLO su questi dati reali (es. giorno più richiesto, rischio di perdere clienti che non tornano, andamento incassi). Ogni insight deve citare i numeri reali nella description.` },
        ],
        tools: [{
          name: "generate_insights",
          description: "Return business insights based on real data",
          input_schema: {
            type: "object",
            properties: {
              insights: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    insight_type: { type: "string", enum: ["revenue", "churn", "busy_period", "growth"] },
                    title: { type: "string" },
                    description: { type: "string", description: "Must cite the real numbers provided" },
                    confidence_score: { type: "number", description: "0-100, honest based on how much data supports this" },
                    timeframe: { type: "string" },
                  },
                  required: ["insight_type", "title", "description", "confidence_score", "timeframe"],
                },
              },
            },
            required: ["insights"],
          },
        }],
        tool_choice: { type: "tool", name: "generate_insights" },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("generate-predictive-insights: Anthropic error", response.status, errBody);
      return new Response(JSON.stringify({ error: `Errore nella generazione dell'analisi (${response.status})` }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const toolUse = result.content?.find((b: { type: string }) => b.type === "tool_use");
    const insights = (toolUse?.input as { insights: any[] } | undefined)?.insights || [];

    // Replace previous insights with the fresh analysis
    await supabase.from("predictive_insights").delete().eq("user_id", userId);
    if (insights.length > 0) {
      await supabase.from("predictive_insights").insert(
        insights.map((i: any) => ({
          user_id: userId,
          insight_type: i.insight_type,
          title: i.title,
          description: i.description,
          confidence_score: i.confidence_score,
          timeframe: i.timeframe,
          status: "active",
          prediction_data: dataSummary,
        }))
      );
    }

    return new Response(JSON.stringify({ success: true, count: insights.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-predictive-insights error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Errore sconosciuto" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
