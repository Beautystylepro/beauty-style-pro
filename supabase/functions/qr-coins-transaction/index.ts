import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Same root-cause bug as wallet-payment: several pages (LiveStreamPage,
// SpinWheelPage, MissionsPage, and the shared useQRCoinRewards hook used for
// watch/react/comment-on-live, sharing, radio, daily login, referrals) tried
// to update profiles.qr_coins directly from the client. RLS correctly blocks
// that, the error was never checked, so the UI always showed "+N QRCoin"
// toasts that never actually happened. This function does real, atomic,
// server-validated credits/debits.
//
// Fixed-amount earn actions also get a server-enforced cooldown (checked
// against the transactions log), since a client-side-only cooldown is
// trivially bypassed by refreshing the page.

const REWARD_MAP: Record<string, { amount: number; label: string; cooldownMs: number }> = {
  watch_live: { amount: 2, label: "Live guardato", cooldownMs: 60_000 },
  react_live: { amount: 1, label: "Reazione live", cooldownMs: 10_000 },
  comment_live: { amount: 1, label: "Commento live", cooldownMs: 15_000 },
  share: { amount: 3, label: "Condivisione", cooldownMs: 30_000 },
  listen_radio: { amount: 1, label: "Radio ascoltata", cooldownMs: 120_000 },
  daily_login: { amount: 5, label: "Login giornaliero", cooldownMs: 86_400_000 },
  complete_mission: { amount: 10, label: "Missione completata", cooldownMs: 0 },
  referral: { amount: 20, label: "Referral", cooldownMs: 0 },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const authed = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await authed.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = userData.user;
    const body = await req.json();
    const kind = body.kind as "earn" | "spend";

    if (kind === "earn") {
      const action = body.action as string;
      const reward = REWARD_MAP[action];
      if (!reward) {
        return new Response(JSON.stringify({ error: "Azione non valida" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (reward.cooldownMs > 0) {
        const { data: last } = await admin
          .from("transactions")
          .select("created_at")
          .eq("user_id", user.id)
          .eq("reference_type", action)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (last && Date.now() - new Date(last.created_at).getTime() < reward.cooldownMs) {
          return new Response(JSON.stringify({ error: "cooldown", awarded: false }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      const { data: newBalance, error } = await admin.rpc("credit_qr_coins", {
        _user_id: user.id,
        _amount: reward.amount,
      });
      if (error) throw error;

      await admin.from("transactions").insert({
        user_id: user.id, amount: reward.amount, type: "earn",
        description: reward.label, reference_type: action,
      });

      return new Response(JSON.stringify({ awarded: true, amount: reward.amount, newBalance }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (kind === "spend") {
      const amount = Number(body.amount);
      const reason = String(body.reason || "spend");
      if (!amount || amount <= 0) {
        return new Response(JSON.stringify({ error: "Importo non valido" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: newBalance, error } = await admin.rpc("debit_qr_coins", {
        _user_id: user.id,
        _amount: amount,
      });
      if (error) {
        const insufficient = error.message?.toLowerCase().includes("insufficient");
        return new Response(JSON.stringify({ error: insufficient ? "Saldo insufficiente" : "Operazione fallita" }), {
          status: insufficient ? 400 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await admin.from("transactions").insert({
        user_id: user.id, amount: -amount, type: "spend",
        description: reason, reference_type: reason,
      });

      // Optional side-effect insert (e.g. stream_tips or challenge_donations
      // row) supplied by the caller. The caller includes the correct
      // user-reference column name for that table (it varies: user_id vs
      // donor_id, etc.) — we don't force-inject a column that might not exist.
      if (body.sideEffect?.table && body.sideEffect?.row) {
        await admin.from(body.sideEffect.table).insert(body.sideEffect.row);
      }

      return new Response(JSON.stringify({ success: true, newBalance }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (kind === "spin_win") {
      // NOTE: the wheel's prize is still rolled client-side and just
      // reported here — a fully tamper-proof fix means moving the random
      // roll itself server-side. As a bounded mitigation until that's done:
      // cap the accepted amount at the wheel's real maximum prize and rate
      // limit so this can't be abused to spam-credit large amounts.
      const MAX_SPIN_PRIZE = 500;
      const amount = Math.min(Number(body.amount) || 0, MAX_SPIN_PRIZE);
      if (amount <= 0) {
        return new Response(JSON.stringify({ error: "Importo non valido" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: last } = await admin
        .from("transactions")
        .select("created_at")
        .eq("user_id", user.id)
        .eq("reference_type", "spin_win")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (last && Date.now() - new Date(last.created_at).getTime() < 3000) {
        return new Response(JSON.stringify({ error: "Troppo veloce, riprova" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: newBalance, error } = await admin.rpc("credit_qr_coins", {
        _user_id: user.id, _amount: amount,
      });
      if (error) throw error;
      await admin.from("transactions").insert({
        user_id: user.id, amount, type: "earn", description: "Vincita ruota", reference_type: "spin_win",
      });
      return new Response(JSON.stringify({ success: true, newBalance }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (kind === "mission_claim") {
      // NOTE: mission progress itself is still tracked client-side with
      // hardcoded/placeholder progress values (not derived from real user
      // activity) — that's a separate, larger redesign. This endpoint only
      // guarantees that (a) the credited amount matches a real known
      // mission's reward, and (b) each mission can only be claimed once per
      // user, even if the client tries again after a page refresh.
      const KNOWN_MISSIONS: Record<string, number> = {
        d1: 5, d2: 10, d3: 5, d4: 10, d5: 5,
        w1: 50, w2: 75, w3: 40, w4: 30,
      };
      const missionId = String(body.missionId || "");
      const amount = KNOWN_MISSIONS[missionId];
      if (!amount) {
        return new Response(JSON.stringify({ error: "Missione non valida" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: already } = await admin
        .from("transactions")
        .select("id")
        .eq("user_id", user.id)
        .eq("reference_type", `mission_${missionId}`)
        .maybeSingle();
      if (already) {
        return new Response(JSON.stringify({ error: "Missione già riscattata" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: newBalance, error } = await admin.rpc("credit_qr_coins", {
        _user_id: user.id, _amount: amount,
      });
      if (error) throw error;
      await admin.from("transactions").insert({
        user_id: user.id, amount, type: "earn", description: "Missione completata", reference_type: `mission_${missionId}`,
      });
      return new Response(JSON.stringify({ success: true, amount, newBalance }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (kind === "transfer") {
      // Peer-to-peer QR Coin transfer. Debit + credit must both succeed or
      // neither should count — if the credit step fails after a successful
      // debit we refund the sender immediately rather than losing coins.
      const amount = Number(body.amount);
      const recipientUserId = String(body.recipientUserId || "");
      if (!amount || amount <= 0 || !recipientUserId) {
        return new Response(JSON.stringify({ error: "Dati non validi" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (recipientUserId === user.id) {
        return new Response(JSON.stringify({ error: "Non puoi trasferire a te stesso" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: senderBalance, error: debitError } = await admin.rpc("debit_qr_coins", {
        _user_id: user.id, _amount: amount,
      });
      if (debitError) {
        const insufficient = debitError.message?.toLowerCase().includes("insufficient");
        return new Response(JSON.stringify({ error: insufficient ? "Saldo insufficiente" : "Trasferimento fallito" }), {
          status: insufficient ? 400 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: creditError } = await admin.rpc("credit_qr_coins", {
        _user_id: recipientUserId, _amount: amount,
      });
      if (creditError) {
        // Refund the sender since the credit side failed.
        await admin.rpc("credit_qr_coins", { _user_id: user.id, _amount: amount });
        console.error("transfer credit failed, refunded sender:", creditError);
        return new Response(JSON.stringify({ error: "Trasferimento fallito, saldo ripristinato" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await admin.from("transactions").insert([
        { user_id: user.id, amount: -amount, type: "spend", description: "Trasferimento inviato", reference_type: "p2p_transfer", reference_id: recipientUserId },
        { user_id: recipientUserId, amount, type: "earn", description: "Trasferimento ricevuto", reference_type: "p2p_transfer", reference_id: user.id },
      ]);

      return new Response(JSON.stringify({ success: true, newBalance: senderBalance }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (kind === "quiz_win" || kind === "battle_win") {
      // Same bounded-mitigation approach as spin_win: the score/result is
      // still computed client-side, so this caps the accepted amount at a
      // sane maximum rather than trusting the client fully.
      const MAX_AMOUNT = kind === "quiz_win" ? 1000 : 500;
      const amount = Math.min(Number(body.amount) || 0, MAX_AMOUNT);
      if (amount <= 0) {
        return new Response(JSON.stringify({ error: "Importo non valido" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: newBalance, error } = await admin.rpc("credit_qr_coins", {
        _user_id: user.id, _amount: amount,
      });
      if (error) throw error;
      await admin.from("transactions").insert({
        user_id: user.id, amount, type: "earn",
        description: kind === "quiz_win" ? "Vincita quiz live" : "Vincita battle live",
        reference_type: kind,
      });
      return new Response(JSON.stringify({ success: true, newBalance }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "kind mancante" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("qr-coins-transaction error:", e);
    return new Response(JSON.stringify({ error: "Errore interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
