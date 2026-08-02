import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireUser } from "../_shared/auth-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    let authedUserId: string;
    try { const r = await requireUser(req); authedUserId = r.userId; } catch (r) { if (r instanceof Response) return r; throw r; }
    const { action, data: reqData } = await req.json();
    const user_id = authedUserId;

    // Admin-only action
    if (action === "admin_growth") {
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user_id, _role: "admin" });
      if (!isAdmin) {
        return jsonResponse({ error: "Forbidden" }, 403);
      }
    }

    // ===== ACTION: Personalized growth suggestions =====
    if (action === "user_suggestions") {
      const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", user_id).maybeSingle();
      if (!profile) return jsonResponse({ suggestions: [] });

      const [prosRes, bookingRes, postRes, subRes, boostRes] = await Promise.all([
        supabase.from("professionals")
          .select("id, business_name, specialty, city, rating, is_verified, user_id")
          .order("rating", { ascending: false }).limit(10),
        supabase.from("bookings").select("id", { count: "exact", head: true }).eq("client_id", user_id),
        supabase.from("posts").select("id", { count: "exact", head: true }).eq("user_id", user_id),
        supabase.from("user_subscriptions").select("*, subscription_plans(slug)")
          .eq("user_id", user_id).eq("status", "active").limit(1).maybeSingle(),
        supabase.from("profile_boosts").select("id")
          .eq("user_id", user_id).eq("active", true)
          .gte("expires_at", new Date().toISOString()).limit(1).maybeSingle(),
      ]);

      const userType = profile.user_type;
      const userCity = profile.city;
      const planSlug = subRes.data?.subscription_plans?.slug || "free";
      const suggestions: any[] = [];

      // --- Client suggestions ---
      if (userType === "client") {
        const nearbyPros = (prosRes.data || []).filter((p: any) => 
          p.city && userCity && p.city.toLowerCase() === userCity.toLowerCase()
        );
        if (nearbyPros.length > 0) {
          suggestions.push({
            type: "matching", icon: "MapPin",
            title: `${nearbyPros.length} professionisti nella tua zona`,
            description: `I migliori: ${nearbyPros.slice(0, 3).map((p: any) => p.business_name).join(", ")}`,
            action: "navigate", target: "/stylists", priority: 90,
          });
        }
        if ((bookingRes.count || 0) === 0) {
          suggestions.push({
            type: "onboarding", icon: "Calendar",
            title: "Prenota il tuo primo appuntamento",
            description: "Scopri i migliori professionisti beauty vicino a te",
            action: "navigate", target: "/stylists", priority: 95,
          });
        }
      }

      // --- Professional suggestions ---
      if (userType === "professional" || userType === "business") {
        if ((postRes.count || 0) < 3) {
          suggestions.push({
            type: "growth", icon: "Camera",
            title: "Pubblica contenuti per crescere",
            description: "I profili con 5+ post ricevono 3x più prenotazioni",
            action: "navigate", target: "/create-post", priority: 85,
          });
        }
        if (planSlug === "free") {
          suggestions.push({
            type: "upsell", icon: "Crown",
            title: "Passa a Pro per più visibilità",
            description: "Priorità in ricerca, analytics e upload illimitati",
            action: "navigate", target: "/subscriptions", priority: 70,
          });
        }
        if (!boostRes.data) {
          suggestions.push({
            type: "boost", icon: "Rocket",
            title: "Boost il tuo profilo oggi",
            description: "Alta domanda nella tua zona! Aumenta la visibilità",
            action: "navigate", target: "/boost-profile", priority: 80,
          });
        }
        suggestions.push({
          type: "engagement", icon: "Video",
          title: "Vai live per aumentare i follower",
          description: "Le live generano 5x più engagement dei post",
          action: "navigate", target: "/go-live", priority: 60,
        });
      }

      // --- General ---
      if (!profile.bio || !profile.avatar_url) {
        suggestions.push({
          type: "onboarding", icon: "UserCheck",
          title: "Completa il tuo profilo",
          description: "I profili completi ricevono 4x più interazioni",
          action: "navigate", target: "/edit-profile", priority: 92,
        });
      }

      suggestions.push({
        type: "referral", icon: "Gift",
        title: "Invita amici, guadagna QR Coins",
        description: "Ogni invito vale 20 QRC per te e il tuo amico",
        action: "navigate", target: "/referral", priority: 50,
      });

      suggestions.sort((a, b) => b.priority - a.priority);
      return jsonResponse({ suggestions: suggestions.slice(0, 5) });
    }

    // ===== ACTION: AI message suggestions =====
    if (action === "message_suggestions") {
      const { recipientName, context } = reqData || {};

      if (!ANTHROPIC_API_KEY) {
        return jsonResponse({
          messages: [
            `Ciao${recipientName ? " " + recipientName : ""}, ti ho trovato su Style! Vorrei prenotare un servizio.`,
            `Ciao! Sei disponibile oggi per un appuntamento?`,
            `Mi piace molto il tuo profilo! Possiamo collaborare?`,
            `Ciao, quanto costa un ${context || "servizio"}?`,
          ],
        });
      }

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-5",
          max_tokens: 500,
          system: `Genera 4 messaggi brevi e professionali in italiano per l'app beauty Style. Contesto: contattare ${recipientName || "un professionista"} per ${context || "prenotare un servizio"}.`,
          messages: [
            { role: "user", content: "Genera 4 messaggi suggeriti" },
          ],
          tools: [{
            name: "return_messages",
            description: "Return suggested messages",
            input_schema: {
              type: "object",
              properties: {
                messages: { type: "array", items: { type: "string" } }
              },
              required: ["messages"],
            },
          }],
          tool_choice: { type: "tool", name: "return_messages" },
        }),
      });

      if (response.ok) {
        const result = await response.json();
        const toolUse = result.content?.find((b: { type: string }) => b.type === "tool_use");
        if (toolUse) {
          return jsonResponse(toolUse.input);
        }
      }

      return jsonResponse({
        messages: [
          `Ciao${recipientName ? " " + recipientName : ""}, ti ho trovato su Style!`,
          `Sei disponibile per un appuntamento?`,
          `Vorrei prenotare un servizio.`,
          `Possiamo collaborare?`,
        ],
      });
    }

    // ===== ACTION: Auto offers for nearby users =====
    if (action === "auto_offers") {
      const { data: pros } = await supabase
        .from("professionals")
        .select("*, profiles:user_id(display_name, city), services(*)")
        .limit(20);

      const offers: any[] = [];
      for (const pro of (pros || [])) {
        const services = (pro.services || []).filter((s: any) => s.active);
        if (services.length > 0) {
          const cheapest = services.sort((a: any, b: any) => a.price - b.price)[0];
          offers.push({
            professional_name: pro.profiles?.display_name || pro.business_name,
            professional_id: pro.id,
            city: pro.profiles?.city || pro.city,
            service_name: cheapest.name,
            original_price: cheapest.price,
            offer_price: Math.round(cheapest.price * 0.9),
            discount: 10,
            type: "auto_discount",
          });
        }
      }

      return jsonResponse({ offers: offers.slice(0, 5) });
    }

    // ===== ACTION: AI content suggestions for creators =====
    if (action === "content_ideas") {
      if (!ANTHROPIC_API_KEY) {
        return jsonResponse({ ideas: [
          "Pubblica un Prima & Dopo di un tuo lavoro 📸",
          "Condividi un consiglio beauty veloce in un Reel",
          "Vai live e mostra la tua tecnica signature",
        ]});
      }

      const { data: profile } = await supabase.from("profiles").select("user_type, city, bio").eq("user_id", user_id).maybeSingle();

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-5",
          max_tokens: 500,
          system: "Genera 4 idee di contenuto beauty per professionisti su Style. Brevi, azionabili, in italiano.",
          messages: [
            { role: "user", content: `Profilo: ${profile?.user_type}, città: ${profile?.city}, bio: ${profile?.bio || 'nessuna'}` },
          ],
          tools: [{
            name: "content_ideas",
            description: "Return content ideas",
            input_schema: {
              type: "object",
              properties: {
                ideas: { type: "array", items: { type: "string" } }
              },
              required: ["ideas"]
            }
          }],
          tool_choice: { type: "tool", name: "content_ideas" }
        }),
      });

      if (response.ok) {
        const result = await response.json();
        const toolUse = result.content?.find((b: { type: string }) => b.type === "tool_use");
        if (toolUse) return jsonResponse(toolUse.input);
      }

      return jsonResponse({ ideas: ["Pubblica un Prima & Dopo", "Condividi un consiglio beauty", "Vai live!"] });
    }

    // ===== ACTION: Admin growth stats =====
    if (action === "admin_growth") {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const [newUsers, newBookings, newPosts, activeSubs, activeBoosts, totalTrans] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", weekAgo.toISOString()),
        supabase.from("bookings").select("id", { count: "exact", head: true }).gte("created_at", weekAgo.toISOString()),
        supabase.from("posts").select("id", { count: "exact", head: true }).gte("created_at", weekAgo.toISOString()),
        supabase.from("user_subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("profile_boosts").select("id", { count: "exact", head: true }).eq("active", true).gte("expires_at", now.toISOString()),
        supabase.from("transactions").select("id", { count: "exact", head: true }).gte("created_at", weekAgo.toISOString()),
      ]);

      return jsonResponse({
        weekly: {
          new_users: newUsers.count || 0,
          new_bookings: newBookings.count || 0,
          new_posts: newPosts.count || 0,
          new_transactions: totalTrans.count || 0,
        },
        current: {
          active_subscriptions: activeSubs.count || 0,
          active_boosts: activeBoosts.count || 0,
        },
      });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (e: unknown) {
    console.error("ai-growth-engine error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
