import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// CheckoutPage previously tried to deduct qr_coins with a direct client-side
// `.update()` call. The RLS policy on profiles correctly blocks users from
// changing their own qr_coins directly (to prevent balance tampering), so
// that update always failed — but the error was never checked, and the
// checkout flow went on to insert a "paid" receipt anyway. Net effect: wallet
// checkouts always "succeeded" on screen without ever actually being charged.
// This function does the debit for real, atomically, server-side.
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

    const { amount, description, type, refId, affiliateCode, deliveryMethod, shippingAddress } = await req.json();
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      return new Response(JSON.stringify({ error: "Importo non valido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Atomic, server-side debit — fails cleanly with "Insufficient balance"
    // if the user doesn't have enough, instead of a client-side race.
    const { data: newBalance, error: debitError } = await admin.rpc("debit_qr_coins", {
      _user_id: user.id,
      _amount: amt,
    });

    if (debitError) {
      const insufficient = debitError.message?.toLowerCase().includes("insufficient");
      return new Response(JSON.stringify({ error: insufficient ? "Saldo insufficiente" : "Pagamento fallito" }), {
        status: insufficient ? 400 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: receipt, error: receiptError } = await admin.from("receipts").insert({
      user_id: user.id,
      receipt_type: type || "payment",
      service_name: description || "Pagamento",
      amount: amt,
      payment_method: "wallet",
      status: "paid",
    }).select("id").single();

    if (receiptError) console.error("receipt insert failed after successful debit:", receiptError);

    if (type === "product" && refId) {
      await admin.from("product_purchases").insert({
        buyer_id: user.id,
        product_id: refId,
        unit_price: amt,
        total_price: amt,
        payment_method: "wallet",
        delivery_method: deliveryMethod === "pickup" ? "pickup" : "shipping",
        shipping_address: deliveryMethod === "pickup" ? null : (shippingAddress || null),
        shipping_status: deliveryMethod === "pickup" ? "ready_for_pickup" : "pending",
      });
    }

    // Platform commission (15%) + affiliate tracking, mirroring the previous checkout logic.
    let sellerId: string | null = null;
    if (refId) {
      if (type === "product") {
        const { data: prod } = await admin.from("products").select("seller_id").eq("id", refId).maybeSingle();
        sellerId = prod?.seller_id ?? null;
      }
      if (sellerId) {
        await admin.from("platform_commissions").insert({
          seller_id: sellerId,
          buyer_id: user.id,
          order_amount: amt,
          commission_rate: 15,
          commission_amount: amt * 0.15,
          commission_type: type === "product" ? "product" : "service",
        });
      }

      const refCode = affiliateCode;
      if (refCode && sellerId) {
        const { data: aff } = await admin.from("affiliates").select("*").eq("affiliate_code", refCode).maybeSingle();
        if (aff) {
          const affCommission = amt * (Number(aff.commission_rate) / 100);
          await admin.from("affiliate_sales").insert({
            affiliate_id: aff.id,
            buyer_id: user.id,
            order_amount: amt,
            commission_amount: affCommission,
            product_id: type === "product" ? refId : null,
          });
          await admin.from("affiliates").update({
            total_earnings: Number(aff.total_earnings) + affCommission,
            total_sales: (aff.total_sales || 0) + 1,
          }).eq("id", aff.id);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, newBalance, receiptId: receipt?.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("wallet-payment error:", e);
    return new Response(JSON.stringify({ error: "Errore interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
