import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  console.log(`[STRIPE-WEBHOOK] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    return new Response("STRIPE_SECRET_KEY not set", { status: 500 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const body = await req.text();

    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!webhookSecret) {
      return new Response("STRIPE_WEBHOOK_SECRET not set", { status: 500 });
    }
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return new Response("Missing stripe-signature header", { status: 400 });
    }
    const event: Stripe.Event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);

    logStep("Event received", { type: event.type });

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id;
        const refId = session.metadata?.ref_id;
        const refType = session.metadata?.ref_type;
        const description = session.metadata?.description;
        const deliveryMethod = session.metadata?.delivery_method;
        const shippingAddress = session.metadata?.shipping_address;
        const customerEmail = session.customer_email || session.customer_details?.email;
        logStep("Checkout completed", { userId, customerEmail, mode: session.mode, refType, refId });

        if (userId && session.mode === "payment") {
          // One-off payment - create receipt
          await supabase.from("receipts").insert({
            user_id: userId,
            receipt_type: refType || "payment",
            service_name: description || "Pagamento Stripe",
            amount: (session.amount_total || 0) / 100,
            payment_method: "stripe",
            status: "paid",
            metadata: { stripe_session_id: session.id },
          });
          logStep("Receipt created for one-off payment");

          // Update related resource
          if (refType === "booking" && refId) {
            const { error: bErr } = await supabase
              .from("bookings")
              .update({ status: "confirmed" })
              .eq("id", refId);
            if (bErr) logStep("Booking update error", { error: bErr.message });
            else logStep("Booking confirmed", { refId });

            await supabase.from("notifications").insert({
              user_id: userId,
              title: "Prenotazione confermata ✅",
              message: "Il tuo pagamento è andato a buon fine, prenotazione confermata.",
              type: "booking",
            });
          }

          if (refType === "product" && refId) {
            const { data: prod } = await supabase
              .from("products")
              .select("seller_id, price")
              .eq("id", refId)
              .maybeSingle();
            await supabase.from("product_purchases").insert({
              buyer_id: userId,
              product_id: refId,
              unit_price: (session.amount_total || 0) / 100,
              total_price: (session.amount_total || 0) / 100,
              payment_method: "stripe",
              delivery_method: deliveryMethod === "pickup" ? "pickup" : "shipping",
              shipping_address: deliveryMethod === "pickup" ? null : (shippingAddress || null),
              shipping_status: deliveryMethod === "pickup" ? "ready_for_pickup" : "pending",
            });
            if (prod?.seller_id) {
              const total = (session.amount_total || 0) / 100;
              // Marketplace commission: 15% (V7 Enterprise SaaS policy)
              const COMMISSION_RATE = 15;
              await supabase.from("platform_commissions").insert({
                seller_id: prod.seller_id,
                buyer_id: userId,
                order_amount: total,
                commission_rate: COMMISSION_RATE,
                commission_amount: total * (COMMISSION_RATE / 100),
                commission_type: "product",
              });
            }
          }
        }

        if (userId && session.mode === "subscription") {
          // Create notification for subscription
          await supabase.from("notifications").insert({
            user_id: userId,
            title: "Abbonamento Attivato ✅",
            message: "Il tuo abbonamento STYLE è stato attivato con successo!",
            type: "subscription",
          });
          logStep("Subscription notification sent");
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerEmail = typeof invoice.customer_email === 'string' ? invoice.customer_email : null;
        logStep("Invoice paid", { customerEmail, amount: invoice.amount_paid });

        if (customerEmail) {
          // Find user by email
          const { data: profile } = await supabase
            .from("profiles")
            .select("user_id")
            .eq("user_id", (await supabase.auth.admin.listUsers()).data.users.find(u => u.email === customerEmail)?.id || "")
            .single();

          if (profile) {
            await supabase.from("receipts").insert({
              user_id: profile.user_id,
              receipt_type: "subscription",
              service_name: "Abbonamento STYLE",
              amount: (invoice.amount_paid || 0) / 100,
              payment_method: "stripe",
              status: "paid",
            });
            logStep("Receipt created for invoice");
          }
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        logStep("Subscription cancelled", { subId: subscription.id });
        // Notification handled by check-subscription polling
        break;
      }

      default:
        logStep("Unhandled event type", { type: event.type });
    }

    return new Response(JSON.stringify({ received: true }), {
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
