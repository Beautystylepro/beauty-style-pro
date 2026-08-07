import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import MobileLayout from "@/components/layout/MobileLayout";
import { Check, Crown, Rocket, Star, Zap, ArrowLeft, Loader2, Settings } from "lucide-react";
import { toast } from "sonner";
import { STRIPE_PLANS, type StripePlanKey } from "@/lib/stripe";

const PLAN_ICONS: Record<string, any> = {
  free: Star,
  pro: Zap,
  business: Rocket,
  premium: Crown,
  client_5: Zap,
  client_10: Rocket,
  client_unlimited: Crown,
};

const PLAN_COLORS: Record<string, string> = {
  free: "border-border",
  pro: "border-primary/60",
  business: "border-primary",
  premium: "border-yellow-500 ring-2 ring-yellow-500/20",
  client_5: "border-primary/60",
  client_10: "border-primary",
  client_unlimited: "border-yellow-500 ring-2 ring-yellow-500/20",
};

const PLANS_CONFIG = [
  {
    slug: "free",
    name: "Free",
    price: 0,
    features: ["Profilo base", "Ricerca professionisti", "3 prenotazioni/mese", "Chat base"],
  },
  {
    slug: "pro",
    name: "Pro",
    price: STRIPE_PLANS.pro.price,
    features: ["Tutto Free +", "Prenotazioni illimitate", "Statistiche avanzate", "Priorità nelle ricerche", "Badge Pro"],
  },
  {
    slug: "business",
    name: "Business",
    price: STRIPE_PLANS.business.price,
    features: ["Tutto Pro +", "Dashboard analytics", "Gestione team", "API access", "Supporto dedicato"],
  },
  {
    slug: "premium",
    name: "Premium",
    price: STRIPE_PLANS.premium.price,
    features: ["Tutto Business +", "Badge Premium esclusivo", "Feature in anteprima", "Supporto prioritario 24/7", "Live illimitati"],
  },
];

// Piani per i CLIENTI: prima vedevano gli stessi piani pensati per
// professionisti ("Gestione team", "API access", "Dashboard analytics"
// — nessun senso per chi prenota soltanto). Basati su quante
// prenotazioni al mese si scelgono, non su funzioni da professionista.
const CLIENT_PLANS_CONFIG = [
  {
    slug: "free",
    name: "Free",
    price: 0,
    bookingsPerMonth: 3,
    features: ["3 prenotazioni al mese", "Ricerca professionisti", "Chat base"],
  },
  {
    slug: "client_5",
    name: "Plus",
    price: 4.99,
    bookingsPerMonth: 8,
    features: ["8 prenotazioni al mese", "Priorità in agenda", "Promemoria automatici"],
  },
  {
    slug: "client_10",
    name: "Gold",
    price: 8.99,
    bookingsPerMonth: 20,
    features: ["20 prenotazioni al mese", "Priorità in agenda", "Sconti esclusivi partner", "Supporto prioritario"],
  },
  {
    slug: "client_unlimited",
    name: "Unlimited",
    price: 14.99,
    bookingsPerMonth: null,
    features: ["Prenotazioni illimitate", "Priorità massima in agenda", "Sconti esclusivi partner", "Supporto 24/7", "QR Coins bonus mensili"],
  },
];

export default function SubscriptionPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [subscriptionEnd, setSubscriptionEnd] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  // Check for success/cancel from Stripe redirect
  useEffect(() => {
    if (searchParams.get("success") === "true") {
      toast.success("🎉 Abbonamento attivato con successo!");
      checkSubscription();
    }
    if (searchParams.get("cancelled") === "true") {
      toast.info("Pagamento annullato");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const checkSubscription = useCallback(async () => {
    if (!user) { setChecking(false); return; }
    try {
      // BUG TROVATO: prima si affidava a "check-subscription", una
      // funzione server che dipende da Stripe e falliva regolarmente
      // (errore 500) — la pagina non mostrava mai correttamente il
      // piano attuale, nemmeno per chi aveva davvero pagato. Ora legge
      // direttamente dalla tabella reale, la stessa fonte affidabile
      // usata anche per sbloccare le funzioni riservate agli abbonati.
      const { data, error } = await supabase
        .from("user_subscriptions")
        .select("status, expires_at, subscription_plans(slug)")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setCurrentPlan((data as any).subscription_plans?.slug || null);
        setSubscriptionEnd(data.expires_at);
      } else {
        setCurrentPlan(null);
        setSubscriptionEnd(null);
      }
    } catch (e) {
      console.error("Check subscription error:", e);
    }
    setChecking(false);
  }, [user]);

  useEffect(() => {
    checkSubscription();
    // Auto-refresh every 60s
    const interval = setInterval(checkSubscription, 60_000);
    return () => clearInterval(interval);
  }, [checkSubscription]);

  const isClientProfile = profile?.user_type === "client" || !profile?.user_type;
  const activePlans = isClientProfile ? CLIENT_PLANS_CONFIG : PLANS_CONFIG;

  const subscribe = async (slug: string) => {
    if (!user) { navigate("/auth"); return; }
    if (slug === "free") return;

    setLoading(slug);
    try {
      // Client plans (client_5, client_10, client_unlimited) have no
      // pre-created Stripe Price — they use ad-hoc recurring pricing
      // instead, since no professional-tier product exists for these.
      const clientPlan = CLIENT_PLANS_CONFIG.find((p) => p.slug === slug);
      const body = clientPlan
        ? { mode: "subscription", amount: Math.round(clientPlan.price * 100), description: `Abbonamento ${clientPlan.name} — ${clientPlan.bookingsPerMonth ?? "prenotazioni illimitate"}`, refType: "subscription", refId: slug }
        : { priceId: STRIPE_PLANS[slug as StripePlanKey]?.price_id, mode: "subscription", refType: "subscription", refId: slug };
      if (!clientPlan && !STRIPE_PLANS[slug as StripePlanKey]) { setLoading(null); return; }

      const { data, error } = await supabase.functions.invoke("create-checkout", { body });

      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (e: any) {
      toast.error(e.message || "Errore nel checkout");
    } finally {
      setLoading(null);
    }
  };

  const manageSubscription = async () => {
    setLoading("manage");
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal");
      if (error) throw error;
      if (data?.error) { toast.error(data.error); setLoading(null); return; }
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (e: any) {
      toast.error(e.message || "Errore");
    }
    setLoading(null);
  };

  return (
    <MobileLayout>
      <header className="sticky top-0 z-40 glass px-5 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)}><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="text-lg font-display font-bold">Abbonamenti</h1>
      </header>

      <div className="px-5 py-6 space-y-6">
        {/* Current Plan Banner */}
        {currentPlan && (
          <div className="rounded-2xl bg-gradient-to-r from-primary/20 to-primary/5 border border-primary/30 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Piano attuale</p>
                <p className="text-lg font-display font-bold text-primary capitalize">{currentPlan}</p>
                {subscriptionEnd && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Rinnovo: {new Date(subscriptionEnd).toLocaleDateString("it-IT")}
                  </p>
                )}
              </div>
              <button onClick={manageSubscription} disabled={loading === "manage"}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-card border border-border text-xs font-medium">
                {loading === "manage" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Settings className="w-3.5 h-3.5" />}
                Gestisci
              </button>
            </div>
          </div>
        )}

        {/* Plans */}
        {checking ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            {activePlans.map((plan) => {
              const Icon = PLAN_ICONS[plan.slug] || Star;
              const isCurrent = currentPlan === plan.slug;

              return (
                <div key={plan.slug}
                  className={`rounded-2xl border-2 ${isCurrent ? "border-primary ring-2 ring-primary/20" : PLAN_COLORS[plan.slug]} bg-card p-5 transition-all ${plan.slug === "premium" ? "relative overflow-hidden" : ""}`}>
                  {plan.slug === "premium" && (
                    <div className="absolute top-0 right-0 bg-yellow-500 text-black text-xs font-bold px-3 py-1 rounded-bl-xl">
                      MIGLIORE
                    </div>
                  )}
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${plan.slug === "premium" ? "bg-yellow-500/20" : "bg-primary/10"}`}>
                      <Icon className={`w-5 h-5 ${plan.slug === "premium" ? "text-yellow-500" : "text-primary"}`} />
                    </div>
                    <div>
                      <h3 className="font-display font-bold">{plan.name}</h3>
                      <p className="text-lg font-bold">
                        {plan.price === 0 ? "Gratis" : `€${plan.price}`}
                        {plan.price > 0 && <span className="text-xs text-muted-foreground font-normal">/mese</span>}
                      </p>
                      {plan.price > 0 && (
                        <p className="text-[11px] font-semibold text-primary mt-0.5">🎁 Primo mese gratis, disdici quando vuoi</p>
                      )}
                    </div>
                  </div>

                  <ul className="space-y-1.5 mb-4">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  {isCurrent ? (
                    <div className="w-full py-2.5 rounded-xl bg-primary/10 text-center text-sm font-semibold text-primary">
                      ✅ Piano Attuale
                    </div>
                  ) : plan.slug === "free" ? (
                    !currentPlan && (
                      <div className="w-full py-2.5 rounded-xl bg-muted text-center text-sm font-semibold text-muted-foreground">
                        Piano Attuale
                      </div>
                    )
                  ) : (
                    <button onClick={() => subscribe(plan.slug)} disabled={!!loading}
                      className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                        plan.slug === "premium"
                          ? "bg-gradient-to-r from-yellow-500 to-yellow-600 text-black"
                          : "bg-primary text-primary-foreground"
                      }`}>
                      {loading === plan.slug ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        currentPlan ? "Cambia Piano" : "Inizia gratis (30 giorni)"
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Refresh button */}
        <button onClick={() => { setChecking(true); checkSubscription(); }}
          className="w-full py-2 text-xs text-muted-foreground text-center hover:text-foreground transition-colors">
          Aggiorna stato abbonamento
        </button>
      </div>
    </MobileLayout>
  );
}
