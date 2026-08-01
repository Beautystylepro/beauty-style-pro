import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  console.log(`[CREATE-CHECKOUT] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user?.email) throw new Error("User not authenticated");
    logStep("User authenticated", { email: user.email });

    const {
      priceId,
      mode = "subscription",
      successUrl,
      cancelUrl,
      amount,
      description,
      currency = "eur",
      refId,
      refType,
      paymentMethod,
    } = await req.json();
    if (!priceId && !amount) throw new Error("priceId or amount is required");
    logStep("Request parsed", { priceId, mode, amount, refType, refId, paymentMethod });

    // Map the app's payment method selection to Stripe's payment_method_types.
    // Previously this was never set, so choosing "PayPal" or "Klarna" in the
    // UI silently showed the same generic (card-only) Stripe page regardless
    // — the selection had zero effect. Klarna also requires currency=eur.
    const methodMap: Record<string, string[]> = {
      card: ["card"],
      paypal: ["paypal"],
      klarna: ["klarna"],
    };
    const paymentMethodTypes = methodMap[paymentMethod] || ["card"];

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Check for existing customer
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Existing customer found", { customerId });
    }

    const origin = req.headers.get("origin") || "https://beauty-style-pro.lovable.app";

    const lineItems = priceId
      ? [{ price: priceId, quantity: 1 }]
      : [{
          price_data: {
            currency,
            product_data: { name: description || "Pagamento Beauty Style Pro" },
            unit_amount: Math.round(Number(amount)),
          },
          quantity: 1,
        }];

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: lineItems,
      mode: mode as "subscription" | "payment",
      payment_method_types: mode === "subscription" ? ["card"] : paymentMethodTypes as Stripe.Checkout.SessionCreateParams.PaymentMethodType[],
      success_url: successUrl || `${origin}/subscriptions?success=true`,
      cancel_url: cancelUrl || `${origin}/subscriptions?cancelled=true`,
      metadata: {
        user_id: user.id,
        ...(refId ? { ref_id: String(refId) } : {}),
        ...(refType ? { ref_type: String(refType) } : {}),
        ...(description ? { description: String(description).slice(0, 400) } : {}),
      },
    });

    logStep("Checkout session created", { sessionId: session.id });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
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
