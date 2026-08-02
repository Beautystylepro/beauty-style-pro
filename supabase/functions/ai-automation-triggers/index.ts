import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Server-to-server auth: require INTERNAL_SECRET
    const secret = req.headers.get('x-internal-secret');
    const expected = Deno.env.get('INTERNAL_SECRET');
    if (!expected || secret !== expected) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { trigger_type } = await req.json().catch(() => ({ trigger_type: "daily_digest" }));

    // Load active module configs with automation enabled
    const { data: modules } = await supabase
      .from("ai_module_configs")
      .select("*")
      .eq("active", true)
      .eq("automation_enabled", true);

    if (!modules || modules.length === 0) {
      return jsonResponse({ processed: 0, message: "No active automation modules" });
    }

    let processed = 0;

    // ═══════════════════════════════════════════════
    // TRIGGER: daily_digest — Morning summary for active users
    // ═══════════════════════════════════════════════
    if (trigger_type === "daily_digest") {
      const { data: activeUsers } = await supabase
        .from("profiles")
        .select("user_id, display_name, user_type, city, qr_coins")
        .limit(100);

      if (!activeUsers) return jsonResponse({ processed: 0 });

      // Get platform stats
      const [livesRes, jobsRes, promosRes] = await Promise.all([
        supabase.from("live_streams").select("id", { count: "exact", head: true }).eq("status", "live"),
        supabase.from("job_posts").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("promo_codes").select("id", { count: "exact", head: true }).eq("active", true),
      ]);

      for (const user of activeUsers) {
        const message = `Buongiorno ${user.display_name || ""}! ☀️ Oggi su STYLE: ${livesRes.count || 0} live, ${jobsRes.count || 0} offerte lavoro e ${promosRes.count || 0} promo attive.`;

        await supabase.from("notifications").insert({
          user_id: user.user_id,
          title: "Il tuo daily digest ✨",
          message,
          type: "ai_digest",
          data: {
            module: "ai_assistant",
            trigger: "daily_digest",
            lives: livesRes.count || 0,
            jobs: jobsRes.count || 0,
            promos: promosRes.count || 0,
          },
        });
        processed++;
      }
    }

    // ═══════════════════════════════════════════════
    // TRIGGER: inactive_nudge — Re-engage inactive users (48h+)
    // ═══════════════════════════════════════════════
    if (trigger_type === "inactive_nudge") {
      const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

      const { data: inactiveUsers } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .lt("updated_at", cutoff)
        .limit(50);

      if (inactiveUsers) {
        for (const user of inactiveUsers) {
          await supabase.from("notifications").insert({
            user_id: user.user_id,
            title: "Ci manchi! 💜",
            message: `${user.display_name || "Ciao"}, torna su STYLE: ci sono novità per te!`,
            type: "ai_nudge",
            data: { module: "ai_assistant", trigger: "inactive_nudge" },
          });
          processed++;
        }
      }
    }

    // ═══════════════════════════════════════════════
    // TRIGGER: low_balance — Notify users with low QRcoin
    // ═══════════════════════════════════════════════
    if (trigger_type === "low_balance") {
      const walletModule = modules.find((m: any) => m.module_key === "payments_wallet");
      const threshold = walletModule?.ai_settings?.low_balance_threshold || 10;

      const { data: lowBalanceUsers } = await supabase
        .from("profiles")
        .select("user_id, display_name, qr_coins")
        .lt("qr_coins", threshold)
        .limit(50);

      if (lowBalanceUsers) {
        for (const user of lowBalanceUsers) {
          await supabase.from("notifications").insert({
            user_id: user.user_id,
            title: "Saldo basso 💰",
            message: `Hai ${user.qr_coins} QRcoin. Completa una missione per guadagnarne!`,
            type: "ai_wallet",
            data: { module: "payments_wallet", trigger: "low_balance", balance: user.qr_coins },
          });
          processed++;
        }
      }
    }

    // ═══════════════════════════════════════════════
    // TRIGGER: live_reminder — Notify about upcoming/active lives
    // ═══════════════════════════════════════════════
    if (trigger_type === "live_reminder") {
      const { data: activeLives } = await supabase
        .from("live_streams")
        .select("id, title, professional_id, viewer_count")
        .eq("status", "live")
        .order("viewer_count", { ascending: false })
        .limit(3);

      if (activeLives && activeLives.length > 0) {
        const { data: users } = await supabase
          .from("profiles")
          .select("user_id")
          .limit(50);

        if (users) {
          const topLive = activeLives[0];
          for (const user of users) {
            await supabase.from("notifications").insert({
              user_id: user.user_id,
              title: "🔴 Live ora!",
              message: `"${topLive.title}" è in diretta con ${topLive.viewer_count} spettatori!`,
              type: "ai_live",
              data: { module: "chat_live", trigger: "live_reminder", stream_id: topLive.id },
            });
            processed++;
          }
        }
      }
    }

    // ═══════════════════════════════════════════════
    // TRIGGER: job_match_notify — Notify matching job offers
    // ═══════════════════════════════════════════════
    if (trigger_type === "job_match_notify") {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { data: recentJobs } = await supabase
        .from("job_posts")
        .select("id, title, category, location")
        .eq("status", "active")
        .gte("created_at", oneDayAgo)
        .limit(10);

      if (recentJobs && recentJobs.length > 0) {
        const { data: jobSeekers } = await supabase
          .from("profiles")
          .select("user_id, display_name, skills, desired_categories")
          .not("desired_categories", "is", null)
          .limit(50);

        if (jobSeekers) {
          for (const user of jobSeekers) {
            const matchingJobs = recentJobs.filter((job: any) =>
              user.desired_categories?.some((cat: string) =>
                job.category?.toLowerCase().includes(cat.toLowerCase())
              )
            );

            if (matchingJobs.length > 0) {
              await supabase.from("notifications").insert({
                user_id: user.user_id,
                title: "Nuove offerte per te 💼",
                message: `${matchingJobs.length} nuove offerte in ${matchingJobs[0].category}!`,
                type: "ai_job",
                data: { module: "job_offers", trigger: "new_offer", jobs: matchingJobs.map((j: any) => j.id) },
              });
              processed++;
            }
          }
        }
      }
    }

    // ═══════════════════════════════════════════════
    // TRIGGER: premium_upsell — Suggest premium to engaged free users
    // ═══════════════════════════════════════════════
    if (trigger_type === "premium_upsell") {
      // Find active free users (no subscription, 7+ days active, 3+ posts)
      const { data: freeUsers } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .limit(200);

      if (freeUsers) {
        for (const user of freeUsers) {
          // Check no active sub
          const { data: sub } = await supabase
            .from("user_subscriptions")
            .select("id")
            .eq("user_id", user.user_id)
            .eq("status", "active")
            .maybeSingle();

          if (!sub) {
            const { count: postCount } = await supabase
              .from("posts")
              .select("id", { count: "exact", head: true })
              .eq("user_id", user.user_id);

            if ((postCount || 0) >= 3) {
              await supabase.from("notifications").insert({
                user_id: user.user_id,
                title: "Sblocca Premium ⭐",
                message: "Sei un utente attivo! Prova Premium gratis per 1 mese e sblocca tutte le funzionalità.",
                type: "ai_premium",
                data: { module: "premium_subscription", trigger: "premium_offer" },
              });
              processed++;
            }
          }
        }
      }
    }

    // ═══════════════════════════════════════════════
    // TRIGGER: engagement_boost — Suggest actions to boost profile
    // ═══════════════════════════════════════════════
    if (trigger_type === "engagement_boost") {
      const { data: professionals } = await supabase
        .from("professionals")
        .select("user_id, business_name, rating, review_count")
        .limit(50);

      if (professionals) {
        for (const pro of professionals) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("display_name, follower_count")
            .eq("user_id", pro.user_id)
            .single();

          if (profile && (profile.follower_count || 0) < 50) {
            await supabase.from("notifications").insert({
              user_id: pro.user_id,
              title: "Aumenta la visibilità 📈",
              message: `${profile.display_name}, pubblica un post o vai live per far crescere il tuo profilo!`,
              type: "ai_growth",
              data: { module: "content_sharing", trigger: "engagement_boost" },
            });
            processed++;
          }
        }
      }
    }

    return jsonResponse({
      processed,
      trigger_type,
      timestamp: new Date().toISOString(),
    });
  } catch (e: unknown) {
    console.error("ai-automation-triggers error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
