import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import webpush from "https://esm.sh/web-push@3.6.7?target=deno";

// This function was referenced by the notify_push_on_insert() database
// trigger (fires on every row inserted into `notifications`) but never
// existed — every push attempt was a 404 (harmless since pg_net calls are
// fire-and-forget, but push notifications never actually reached anyone's
// device/browser when the app wasn't open). This implements real Web Push
// using VAPID, matching the push_subscriptions table + subscribe flow
// already present in useNotifications.ts.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    if (!vapidPublicKey || !vapidPrivateKey) {
      console.error("VAPID keys not configured — push notification skipped");
      return new Response(JSON.stringify({ error: "VAPID not configured" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    webpush.setVapidDetails(
      "mailto:support@stayle.app",
      vapidPublicKey,
      vapidPrivateKey,
    );

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const { user_id, title, message, type, data, notification_id } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: subs, error } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", user_id);

    if (error) throw error;
    if (!subs?.length) {
      return new Response(JSON.stringify({ sent: 0, reason: "no subscriptions" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = JSON.stringify({
      title: title || "Stayle",
      body: message || "",
      type: type || "info",
      data: { ...(data || {}), notification_id },
    });

    let sent = 0;
    const staleIds: string[] = [];

    await Promise.all(subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        sent++;
      } catch (err) {
        // 404/410 = subscription expired or the user revoked permission — clean it up.
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) staleIds.push(sub.id);
        else console.error("push send failed:", err);
      }
    }));

    if (staleIds.length) {
      await admin.from("push_subscriptions").delete().in("id", staleIds);
    }

    return new Response(JSON.stringify({ sent, removed: staleIds.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-push-notification error:", e);
    return new Response(JSON.stringify({ error: "Errore interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
