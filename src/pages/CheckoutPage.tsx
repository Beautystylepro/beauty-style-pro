import { ArrowLeft, CreditCard, Wallet, Banknote, QrCode, ShieldCheck, Truck, Store } from "lucide-react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import MobileLayout from "@/components/layout/MobileLayout";
import { toast } from "sonner";

const paymentMethods = [
  { id: "wallet", label: "QR Coins Wallet", icon: Wallet, desc: "Paga con il tuo saldo" },
  { id: "card", label: "Carta di Credito/Debito", icon: CreditCard, desc: "Visa, Mastercard" },
  { id: "paypal", label: "PayPal", icon: Banknote, desc: "Paga con PayPal" },
  { id: "klarna", label: "Klarna — 3 Rate", icon: Banknote, desc: "Paga in 3 rate senza interessi" },
];

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [params] = useSearchParams();
  const [selected, setSelected] = useState("wallet");
  const [processing, setProcessing] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState<"shipping" | "pickup">("shipping");
  const [shippingAddress, setShippingAddress] = useState("");

  const amount = parseFloat(params.get("amount") || "0");
  const description = params.get("desc") || "Pagamento";
  const type = params.get("type") || "payment";
  const refId = params.get("ref") || "";

  if (!user) {
    return (
      <MobileLayout>
        <div className="flex flex-col items-center justify-center min-h-[80vh] px-6 text-center">
          <ShieldCheck className="w-10 h-10 text-primary mb-4" />
          <h2 className="text-xl font-display font-bold mb-2">Pagamento Sicuro</h2>
          <p className="text-sm text-muted-foreground mb-6">Accedi per procedere al pagamento</p>
          <button onClick={() => navigate("/auth")} className="px-8 py-3 rounded-full bg-primary text-primary-foreground font-semibold">Accedi</button>
        </div>
      </MobileLayout>
    );
  }

  const handlePay = async () => {
    if (type === "product" && deliveryMethod === "shipping" && !shippingAddress.trim()) {
      toast.error("Inserisci l'indirizzo di spedizione, oppure scegli il ritiro in negozio");
      return;
    }
    setProcessing(true);
    try {
      // Stripe-based payments (card, paypal, klarna) — webhook records receipt
      if (selected === "card" || selected === "paypal" || selected === "klarna") {
        const successUrl =
          type === "booking"
            ? `${window.location.origin}/my-bookings?payment=success`
            : `${window.location.origin}/wallet?payment=success`;
        const { data, error } = await supabase.functions.invoke("create-checkout", {
          body: {
            priceId: null,
            mode: "payment",
            amount: Math.round(amount * 100),
            description,
            refId,
            refType: type,
            successUrl,
            paymentMethod: selected,
            cancelUrl: `${window.location.origin}/checkout?amount=${amount}&desc=${encodeURIComponent(description)}&type=${type}&ref=${refId}`,
            deliveryMethod: type === "product" ? deliveryMethod : undefined,
            shippingAddress: type === "product" && deliveryMethod === "shipping" ? shippingAddress : undefined,
          },
        });
        if (error) throw error;
        if (data?.url) {
          window.location.href = data.url;
          return;
        }
        throw new Error("Stripe URL non disponibile");
      }

      if (selected === "wallet") {
        const balance = profile?.qr_coins || 0;
        if (balance < amount) {
          toast.error("Saldo insufficiente");
          setProcessing(false);
          return;
        }
        const affiliateCode = new URLSearchParams(window.location.search).get("aff");
        const { data, error } = await supabase.functions.invoke("wallet-payment", {
          body: {
            amount, description, type, refId, affiliateCode,
            deliveryMethod: type === "product" ? deliveryMethod : undefined,
            shippingAddress: type === "product" && deliveryMethod === "shipping" ? shippingAddress : undefined,
          },
        });
        if (error || data?.error) {
          toast.error(data?.error || "Pagamento fallito, riprova");
          setProcessing(false);
          return;
        }
        toast.success(deliveryMethod === "pickup" ? "Pagamento completato! Ritira in negozio quando pronto 🏪" : "Pagamento completato!");
        navigate(type === "booking" ? "/my-bookings" : "/wallet");
        return;
      }
    } catch (e) {
      console.error("Checkout error:", e);
      toast.error("Errore nel pagamento");
    }
    setProcessing(false);
  };

  const klarnaInstallment = (amount / 3).toFixed(2);

  return (
    <MobileLayout>
      <header className="sticky top-0 z-40 glass px-5 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)}><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="text-lg font-display font-bold">Checkout</h1>
      </header>

      <div className="px-5 py-6 space-y-6">
        {/* Order Summary */}
        <div className="rounded-2xl bg-card border border-border/50 p-5">
          <p className="text-xs text-muted-foreground mb-1">Riepilogo ordine</p>
          <p className="text-sm font-medium mb-3">{description}</p>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-display font-bold">€{amount.toFixed(2)}</span>
            {selected === "klarna" && (
              <span className="text-xs text-muted-foreground">oppure 3 × €{klarnaInstallment}</span>
            )}
          </div>
        </div>

        {/* Delivery Method — only for product purchases */}
        {type === "product" && (
          <div>
            <h3 className="text-sm font-semibold mb-3">Consegna</h3>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button
                type="button"
                onClick={() => setDeliveryMethod("shipping")}
                className={`p-3 rounded-xl border-2 flex flex-col items-center gap-1.5 transition-colors ${
                  deliveryMethod === "shipping" ? "border-primary bg-primary/5" : "border-border/50"
                }`}
              >
                <Truck className="w-5 h-5 text-primary" />
                <span className="text-xs font-semibold">Spedizione</span>
              </button>
              <button
                type="button"
                onClick={() => setDeliveryMethod("pickup")}
                className={`p-3 rounded-xl border-2 flex flex-col items-center gap-1.5 transition-colors ${
                  deliveryMethod === "pickup" ? "border-primary bg-primary/5" : "border-border/50"
                }`}
              >
                <Store className="w-5 h-5 text-primary" />
                <span className="text-xs font-semibold">Ritiro in negozio</span>
              </button>
            </div>
            {deliveryMethod === "shipping" ? (
              <input
                value={shippingAddress}
                onChange={(e) => setShippingAddress(e.target.value)}
                placeholder="Indirizzo di spedizione completo"
                className="w-full h-11 px-3 rounded-xl border border-border/50 bg-card text-sm"
              />
            ) : (
              <p className="text-xs text-muted-foreground px-1">
                Riceverai una notifica quando il prodotto sarà pronto per il ritiro presso il negozio del venditore.
              </p>
            )}
          </div>
        )}

        {/* Payment Methods */}
        <div>
          <h3 className="text-sm font-semibold mb-3">Metodo di pagamento</h3>
          <div className="space-y-2">
            {paymentMethods.map(m => (
              <button key={m.id} onClick={() => setSelected(m.id)}
                className={`w-full flex items-center gap-3 p-4 rounded-2xl border transition-all ${
                  selected === m.id ? "border-primary bg-primary/5" : "border-border/50 bg-card"
                }`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${selected === m.id ? "bg-primary/10" : "bg-muted"}`}>
                  <m.icon className={`w-5 h-5 ${selected === m.id ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold">{m.label}</p>
                  <p className="text-[11px] text-muted-foreground">{m.desc}</p>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  selected === m.id ? "border-primary" : "border-border"
                }`}>
                  {selected === m.id && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Wallet Balance */}
        {selected === "wallet" && (
          <div className="rounded-xl bg-muted/50 p-3 flex items-center gap-2">
            <Wallet className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Saldo: <strong>{(profile?.qr_coins || 0).toLocaleString()} QR Coins</strong></span>
          </div>
        )}

        {/* Klarna Info */}
        {selected === "klarna" && (
          <div className="rounded-xl bg-muted/50 p-4 space-y-2">
            <p className="text-xs font-semibold">Paga in 3 rate senza interessi</p>
            {[1, 2, 3].map(i => (
              <div key={i} className="flex justify-between text-xs text-muted-foreground">
                <span>Rata {i}</span>
                <span>€{klarnaInstallment}</span>
              </div>
            ))}
          </div>
        )}

        {/* Pay Button */}
        <button onClick={handlePay} disabled={processing || amount <= 0}
          className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-bold text-base disabled:opacity-50 transition-opacity">
          {processing ? "Elaborazione..." : `Paga €${amount.toFixed(2)}`}
        </button>

        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <ShieldCheck className="w-4 h-4" />
          <span className="text-[11px]">Pagamento sicuro e protetto</span>
        </div>
      </div>
    </MobileLayout>
  );
}
