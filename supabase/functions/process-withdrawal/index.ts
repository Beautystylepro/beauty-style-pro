import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  console.log(`[PROCESS-WITHDRAWAL] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");

    const { amount, iban, holderName } = await req.json();
    if (!amount || amount <= 0) throw new Error("Invalid amount");
    if (!iban) throw new Error("IBAN required");
    logStep("Withdrawal request", { userId: user.id, amount, iban: `****${iban.slice(-4)}` });

    // Verification info (non-blocking)
    const { data: profile } = await supabase
      .from("profiles")
      .select("verification_status")
      .eq("user_id", user.id)
      .single();
    if (profile && profile.verification_status !== "verified") {
      logStep("User not fully verified, flagging for review");
    }

    // IMPORTANT: Stripe does not allow sending money to an arbitrary IBAN
    // typed into a form — that would be trivially abusable for fraud.
    // A real automatic bank transfer requires each professional to have
    // their own Stripe Connect account (pending: needs the registered
    // company/SRL to set up). Until then, this is honestly a manual
    // request queued for admin review — the balance is safely reserved
    // (debited) so it can't be spent twice, but no money moves
    // automatically yet. Do not tell users a transfer is already "in
    // progress" when nothing has actually been sent.
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    void stripe; // kept initialized for when Stripe Connect payouts are wired in

    // Atomically deduct balance (prevents TOCTOU race)
    const { data: newBalance, error: debitErr } = await supabase.rpc("debit_qr_coins", {
      _user_id: user.id,
      _amount: amount,
    });
    if (debitErr) {
      throw new Error("Insufficient balance");
    }

    // Record transaction
    await supabase.from("transactions").insert({
      user_id: user.id,
      type: "withdraw",
      amount: -amount,
      description: `Richiesta prelievo IBAN ****${iban.slice(-4)} (in revisione)`,
      reference_type: "withdrawal",
    });

    // Create a real admin work item so someone actually processes this
    // by hand until automatic payouts exist — instead of the request
    // silently vanishing into a "processing" state nobody ever resolves.
    const { data: withdrawalRequest } = await supabase.from("withdrawal_requests").insert({
      user_id: user.id,
      amount,
      iban,
      holder_name: holderName || null,
      status: "pending_review",
    }).select("id").maybeSingle();

    // Create receipt
    await supabase.from("receipts").insert({
      user_id: user.id,
      receipt_type: "withdrawal",
      service_name: `Richiesta prelievo su IBAN ****${iban.slice(-4)}`,
      amount,
      payment_method: "bank_transfer",
      status: "processing",
    });

    // Create notification — honest about this being a manual request,
    // not an automated transfer already underway.
    await supabase.from("notifications").insert({
      user_id: user.id,
      title: "Richiesta di prelievo ricevuta 🏦",
      message: `La tua richiesta di prelievo di €${amount} su IBAN ****${iban.slice(-4)} è stata registrata ed è in revisione manuale. Ti aggiorneremo appena il bonifico sarà inviato.`,
      type: "payment",
    });

    logStep("Withdrawal request queued for manual review", { newBalance, requestId: withdrawalRequest?.id });

    return new Response(JSON.stringify({
      success: true,
      message: "Richiesta di prelievo registrata, in revisione manuale",
      newBalance,
      manualReview: true,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
