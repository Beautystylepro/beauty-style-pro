import { ArrowDownLeft, ArrowUpRight, Coins, CreditCard, Gift, History, Plus, Wallet, Building2, Banknote, QrCode, Receipt, ChevronRight, Trash2, Send, Download, Smartphone, Shield, Check, X, SplitSquareHorizontal } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import MobileLayout from "@/components/layout/MobileLayout";
import { toast } from "sonner";
import QRTransferModal from "@/components/wallet/QRTransferModal";
import ShareAppModal from "@/components/wallet/ShareAppModal";

export default function WalletPage() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [tab, setTab] = useState<"overview" | "methods" | "history">("overview");
  const [showAddCard, setShowAddCard] = useState(false);
  const [cardForm, setCardForm] = useState({ number: "", expiry: "", cvv: "", name: "" });
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [showQRTransfer, setShowQRTransfer] = useState(false);
  const [showShareApp, setShowShareApp] = useState(false);
  const [showAddIBAN, setShowAddIBAN] = useState(false);
  const [ibanForm, setIbanForm] = useState({ iban: "", holder: "" });

  useEffect(() => {
    if (user) { loadTransactions(); loadPaymentMethods(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadTransactions = async () => {
    const { data } = await supabase
      .from("wallet_transactions")
      .select("*")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false })
      .limit(30);
    if (data) setTransactions(data);
  };

  const loadPaymentMethods = async () => {
    const { data } = await supabase
      .from("payment_methods")
      .select("*")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false });
    if (data) setPaymentMethods(data);
  };

  const addCard = async () => {
    if (!cardForm.number || !cardForm.name) { toast.error("Compila tutti i campi"); return; }
    const lastFour = cardForm.number.replace(/\s/g, "").slice(-4);
    const brand = cardForm.number.startsWith("4") ? "Visa" : cardForm.number.startsWith("5") ? "Mastercard" : "Card";
    await supabase.from("payment_methods").insert({
      user_id: user!.id, method_type: "card", label: `${brand} •••• ${lastFour}`, last_four: lastFour, brand,
    });
    setShowAddCard(false);
    setCardForm({ number: "", expiry: "", cvv: "", name: "" });
    loadPaymentMethods();
    toast.success("Carta aggiunta!");
  };

  const addPaypal = async () => {
    const existing = paymentMethods.find(m => m.method_type === "paypal");
    if (existing) { toast.info("PayPal già collegato"); return; }
    await supabase.from("payment_methods").insert({
      user_id: user!.id, method_type: "paypal", label: "PayPal", brand: "PayPal",
    });
    loadPaymentMethods();
    toast.success("PayPal collegato!");
  };

  const addGooglePay = async () => {
    const existing = paymentMethods.find(m => m.method_type === "google_pay");
    if (existing) { toast.info("Google Pay già collegato"); return; }
    await supabase.from("payment_methods").insert({
      user_id: user!.id, method_type: "google_pay", label: "Google Pay", brand: "Google",
    });
    loadPaymentMethods();
    toast.success("Google Pay collegato!");
  };

  const addKlarna = async () => {
    const existing = paymentMethods.find(m => m.method_type === "klarna");
    if (existing) { toast.info("Klarna già collegato"); return; }
    await supabase.from("payment_methods").insert({
      user_id: user!.id, method_type: "klarna", label: "Klarna — Paga in 3 rate", brand: "Klarna",
    });
    loadPaymentMethods();
    toast.success("Klarna collegato!");
  };

  const saveIBAN = async () => {
    const cleanIban = ibanForm.iban.replace(/\s/g, "").toUpperCase();
    if (cleanIban.length < 15 || cleanIban.length > 34) { toast.error("IBAN non valido"); return; }
    if (!ibanForm.holder.trim()) { toast.error("Inserisci l'intestatario"); return; }

    const { data: existingPrivate } = await supabase.from("profiles_private").select("id").eq("user_id", user!.id).maybeSingle();
    if (existingPrivate) {
      await supabase.from("profiles_private").update({
        iban: cleanIban,
        bank_holder_name: ibanForm.holder.trim(),
      }).eq("user_id", user!.id);
    } else {
      await supabase.from("profiles_private").insert({
        user_id: user!.id,
        iban: cleanIban,
        bank_holder_name: ibanForm.holder.trim(),
      });
    }

    // Also save as payment method
    const existing = paymentMethods.find(m => m.method_type === "bank_transfer");
    if (!existing) {
      await supabase.from("payment_methods").insert({
        user_id: user!.id,
        method_type: "bank_transfer",
        label: `IBAN •••• ${cleanIban.slice(-4)}`,
        last_four: cleanIban.slice(-4),
        brand: "Conto Bancario",
      });
    } else {
      await supabase.from("payment_methods").update({
        label: `IBAN •••• ${cleanIban.slice(-4)}`,
        last_four: cleanIban.slice(-4),
      }).eq("id", existing.id);
    }

    await refreshProfile();
    loadPaymentMethods();
    setShowAddIBAN(false);
    setIbanForm({ iban: "", holder: "" });
    toast.success("Conto bancario collegato!");
  };

  const removeMethod = async (id: string) => {
    const method = paymentMethods.find(m => m.id === id);
    if (method?.method_type === "bank_transfer") {
      await supabase.from("profiles_private").update({ iban: null, bank_holder_name: null }).eq("user_id", user!.id);
      await refreshProfile();
    }
    await supabase.from("payment_methods").delete().eq("id", id);
    loadPaymentMethods();
    toast.success("Metodo rimosso");
  };

  // GATE: real bank payouts require Stripe Connect (KYC), which needs the
  // company to be formally registered first. Until then, block execution
  // with an honest message instead of silently debiting balance with no
  // real transfer behind it. Flip this to true once Stripe Connect payouts
  // are wired into process-withdrawal.
  const WITHDRAWALS_LIVE = false;

  const handleWithdraw = async () => {
    if (!WITHDRAWALS_LIVE) {
      toast.info("I prelievi reali non sono ancora attivi", {
        description: "Saranno disponibili a breve, dopo l'attivazione del sistema di pagamento verso conti bancari. Il tuo saldo resta al sicuro.",
      });
      return;
    }
    const amt = parseFloat(withdrawAmount);
    if (!amt || amt <= 0) { toast.error("Importo non valido"); return; }
    const balance = profile?.qr_coins || 0;
    if (amt > balance) { toast.error("Saldo insufficiente"); return; }
    if (!profile?.iban) { toast.error("Collega prima un conto bancario"); return; }
    if (amt < 10) { toast.error("Importo minimo: €10"); return; }

    try {
      const { data, error } = await supabase.functions.invoke("process-withdrawal", {
        body: { amount: amt, iban: profile.iban, holderName: profile.bank_holder_name },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      await refreshProfile();
      loadTransactions();
      setShowWithdraw(false);
      setWithdrawAmount("");
      toast.success(`Prelievo di €${amt} in elaborazione! 🏦`, {
        description: data?.estimatedArrival || "2-5 giorni lavorativi",
      });
    } catch (e: any) {
      toast.error(e.message || "Errore nel prelievo");
    }
  };

  const balance = profile?.qr_coins || 0;

  const getMethodIcon = (type: string) => {
    switch (type) {
      case "card": return <CreditCard className="w-5 h-5" />;
      case "bank_transfer": return <Building2 className="w-5 h-5" />;
      case "google_pay": return <Smartphone className="w-5 h-5" />;
      case "paypal": return <Banknote className="w-5 h-5" />;
      case "klarna": return <SplitSquareHorizontal className="w-5 h-5" />;
      default: return <Wallet className="w-5 h-5" />;
    }
  };

  const getMethodColor = (type: string) => {
    switch (type) {
      case "card": return "bg-primary/10 text-primary";
      case "bank_transfer": return "bg-blue-500/10 text-blue-500";
      case "google_pay": return "bg-green-500/10 text-green-500";
      case "paypal": return "bg-yellow-500/10 text-yellow-600";
      case "klarna": return "bg-pink-500/10 text-pink-500";
      default: return "bg-muted text-muted-foreground";
    }
  };

  if (!user) {
    return (
      <MobileLayout>
        <div className="flex flex-col items-center justify-center min-h-[80vh] px-6 text-center">
          <Wallet className="w-10 h-10 text-primary mb-4" />
          <h2 className="text-xl font-display font-bold mb-2">Il tuo Wallet</h2>
          <p className="text-sm text-muted-foreground mb-6">Accedi per gestire il tuo portafoglio</p>
          <button onClick={() => navigate("/auth")} className="px-8 py-3 rounded-full bg-primary text-primary-foreground font-semibold">Accedi</button>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout>
      <header className="sticky top-0 z-40 glass px-5 py-3">
        <h1 className="text-lg font-display font-bold">Wallet</h1>
      </header>

      <div className="px-5 py-6 space-y-6">
        {/* Balance Card */}
        <div className="rounded-2xl gradient-primary p-6 text-primary-foreground">
          <p className="text-xs opacity-80 mb-1">Saldo disponibile</p>
          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-3xl font-display font-bold">{balance.toLocaleString()}</span>
            <span className="text-sm opacity-80">QR Coins</span>
          </div>
          <div className="flex gap-3">
            <button onClick={() => navigate("/qr-coins")}
              className="flex-1 py-2.5 rounded-xl bg-primary-foreground/20 text-sm font-semibold flex items-center justify-center gap-2">
              <Plus className="w-4 h-4" /> Ricarica
            </button>
            <button onClick={() => setShowWithdraw(true)}
              className="flex-1 py-2.5 rounded-xl bg-primary-foreground/20 text-sm font-semibold flex items-center justify-center gap-2">
              <ArrowUpRight className="w-4 h-4" /> Preleva
            </button>
          </div>
        </div>

        {/* Connected accounts summary */}
        {(profile?.iban || paymentMethods.length > 0) && (
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {profile?.iban && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 shrink-0">
                <Building2 className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-[11px] font-semibold text-blue-500">IBAN •••{profile.iban.slice(-4)}</span>
                <Check className="w-3 h-3 text-blue-500" />
              </div>
            )}
            {paymentMethods.filter(m => m.method_type === "card").slice(0, 2).map(m => (
              <div key={m.id} className="flex items-center gap-2 px-3 py-2 rounded-full bg-primary/10 border border-primary/20 shrink-0">
                <CreditCard className="w-3.5 h-3.5 text-primary" />
                <span className="text-[11px] font-semibold text-primary">{m.label}</span>
              </div>
            ))}
            {paymentMethods.find(m => m.method_type === "google_pay") && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-green-500/10 border border-green-500/20 shrink-0">
                <Smartphone className="w-3.5 h-3.5 text-green-500" />
                <span className="text-[11px] font-semibold text-green-500">Google Pay</span>
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-muted rounded-xl p-1">
          {([["overview", "Panoramica"], ["methods", "Metodi"], ["history", "Storico"]] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${tab === key ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Overview */}
        {tab === "overview" && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { Icon: CreditCard, label: "Paga", action: () => navigate("/shop") },
                { Icon: Gift, label: "Invia Tip", action: () => navigate("/live") },
                { Icon: Receipt, label: "Ricevute", action: () => navigate("/receipts") },
              ].map(item => (
                <button key={item.label} onClick={item.action}
                  className="flex flex-col items-center gap-2 py-4 rounded-2xl bg-card border border-border/50">
                  <item.Icon className="w-5 h-5 text-muted-foreground" />
                  <span className="text-[11px] text-muted-foreground font-medium">{item.label}</span>
                </button>
              ))}
            </div>

            {/* QR Coin Exchange */}
            <button onClick={() => setShowQRTransfer(true)}
              className="w-full flex items-center gap-3 p-4 rounded-2xl bg-card border border-border/50">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Send className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-semibold">Scambia QR Coins</p>
                <p className="text-[11px] text-muted-foreground">Invia o ricevi tramite codice QR</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>

            {/* Download & Share App */}
            <button onClick={() => setShowShareApp(true)}
              className="w-full flex items-center gap-3 p-4 rounded-2xl bg-card border border-border/50">
              <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                <Download className="w-5 h-5 text-green-500" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-semibold">Scarica & Condividi App</p>
                <p className="text-[11px] text-muted-foreground">Installa o invia agli amici</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>

            {/* Recent */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Ultime transazioni</h3>
              {transactions.length === 0 ? (
                <div className="text-center py-6">
                  <Coins className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Nessuna transazione</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {transactions.slice(0, 5).map(tx => (
                    <div key={tx.id} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border/50">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center ${Number(tx.amount) >= 0 ? "bg-green-500/10" : "bg-primary/10"}`}>
                        {Number(tx.amount) >= 0 ? <ArrowDownLeft className="w-4 h-4 text-green-500" /> : <ArrowUpRight className="w-4 h-4 text-primary" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{tx.description || tx.type}</p>
                        <p className="text-[11px] text-muted-foreground">{new Date(tx.created_at).toLocaleDateString("it-IT")}</p>
                      </div>
                      <span className={`text-sm font-bold ${Number(tx.amount) >= 0 ? "text-green-500" : ""}`}>
                        {Number(tx.amount) >= 0 ? "+" : ""}€{Math.abs(Number(tx.amount)).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Payment Methods */}
        {tab === "methods" && (
          <div className="space-y-5">
            {/* Bank Account Section */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Conto Bancario</h3>
              {profile?.iban ? (
                <div className="p-4 rounded-2xl bg-card border border-blue-500/20 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl" />
                  <div className="relative flex items-start gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                      <Building2 className="w-6 h-6 text-blue-500" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-bold">Conto Bancario</p>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 font-semibold flex items-center gap-1">
                          <Check className="w-2.5 h-2.5" /> Collegato
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">IBAN: •••• •••• •••• {profile.iban.slice(-4)}</p>
                      {profile.bank_holder_name && (
                        <p className="text-xs text-muted-foreground">Intestatario: {profile.bank_holder_name}</p>
                      )}
                    </div>
                    <button onClick={() => {
                      setIbanForm({ iban: profile.iban || "", holder: profile.bank_holder_name || "" });
                      setShowAddIBAN(true);
                    }} className="text-xs text-primary font-semibold">Modifica</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowAddIBAN(true)}
                  className="w-full p-4 rounded-2xl border-2 border-dashed border-blue-500/30 bg-blue-500/5 flex items-center gap-3 hover:bg-blue-500/10 transition-colors">
                  <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-blue-500" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-bold">Collega Conto Bancario</p>
                    <p className="text-[11px] text-muted-foreground">Aggiungi IBAN per prelievi e pagamenti</p>
                  </div>
                  <Plus className="w-5 h-5 text-blue-500" />
                </button>
              )}
            </div>

            {/* Cards Section */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Carte di Pagamento</h3>
              <div className="space-y-2">
                {paymentMethods.filter(m => m.method_type === "card").map(pm => (
                  <div key={pm.id} className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border/50">
                    <div className={`w-10 h-10 rounded-xl ${getMethodColor("card")} flex items-center justify-center`}>
                      {getMethodIcon("card")}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold">{pm.label}</p>
                      <p className="text-[11px] text-muted-foreground">{pm.brand}</p>
                    </div>
                    <button onClick={() => removeMethod(pm.id)} className="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center">
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </div>
                ))}
                <button onClick={() => setShowAddCard(true)}
                  className="w-full py-3 rounded-2xl border-2 border-dashed border-border text-sm font-semibold text-muted-foreground flex items-center justify-center gap-2 hover:border-primary/30 hover:text-primary transition-colors">
                  <CreditCard className="w-4 h-4" /> Aggiungi Carta
                </button>
              </div>
            </div>

            {/* Digital Wallets Section */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Wallet Digitali</h3>
              <div className="space-y-2">
                {/* Google Pay */}
                {paymentMethods.find(m => m.method_type === "google_pay") ? (
                  <div className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-green-500/20">
                    <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                      <Smartphone className="w-5 h-5 text-green-500" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold">Google Pay</p>
                      <p className="text-[11px] text-green-500 font-medium flex items-center gap-1">
                        <Check className="w-3 h-3" /> Collegato
                      </p>
                    </div>
                    <button onClick={() => removeMethod(paymentMethods.find(m => m.method_type === "google_pay")!.id)}
                      className="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center">
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </div>
                ) : (
                  <button onClick={addGooglePay}
                    className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 border-dashed border-green-500/30 bg-green-500/5 hover:bg-green-500/10 transition-colors">
                    <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                      <Smartphone className="w-5 h-5 text-green-500" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-bold">Google Pay</p>
                      <p className="text-[11px] text-muted-foreground">Paga rapidamente con Google</p>
                    </div>
                    <Plus className="w-5 h-5 text-green-500" />
                  </button>
                )}

                {/* PayPal */}
                {paymentMethods.find(m => m.method_type === "paypal") ? (
                  <div className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-yellow-500/20">
                    <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center">
                      <Banknote className="w-5 h-5 text-yellow-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold">PayPal</p>
                      <p className="text-[11px] text-yellow-600 font-medium flex items-center gap-1">
                        <Check className="w-3 h-3" /> Collegato
                      </p>
                    </div>
                    <button onClick={() => removeMethod(paymentMethods.find(m => m.method_type === "paypal")!.id)}
                      className="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center">
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </div>
                ) : (
                  <button onClick={addPaypal}
                    className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 border-dashed border-yellow-500/30 bg-yellow-500/5 hover:bg-yellow-500/10 transition-colors">
                    <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center">
                      <Banknote className="w-5 h-5 text-yellow-600" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-bold">PayPal</p>
                      <p className="text-[11px] text-muted-foreground">Collega il tuo account PayPal</p>
                    </div>
                    <Plus className="w-5 h-5 text-yellow-600" />
                  </button>
                )}

                {/* Klarna */}
                {paymentMethods.find(m => m.method_type === "klarna") ? (
                  <div className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-pink-500/20">
                    <div className="w-10 h-10 rounded-xl bg-pink-500/10 flex items-center justify-center">
                      <SplitSquareHorizontal className="w-5 h-5 text-pink-500" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold">Klarna</p>
                      <p className="text-[11px] text-pink-500 font-medium flex items-center gap-1">
                        <Check className="w-3 h-3" /> Collegato — Paga in 3 rate
                      </p>
                    </div>
                    <button onClick={() => removeMethod(paymentMethods.find(m => m.method_type === "klarna")!.id)}
                      className="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center">
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </div>
                ) : (
                  <button onClick={addKlarna}
                    className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 border-dashed border-pink-500/30 bg-pink-500/5 hover:bg-pink-500/10 transition-colors">
                    <div className="w-10 h-10 rounded-xl bg-pink-500/10 flex items-center justify-center">
                      <SplitSquareHorizontal className="w-5 h-5 text-pink-500" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-bold">Klarna</p>
                      <p className="text-[11px] text-muted-foreground">Paga in 3 rate senza interessi</p>
                    </div>
                    <Plus className="w-5 h-5 text-pink-500" />
                  </button>
                )}
              </div>
            </div>

            {/* Security note */}
            <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/50">
              <Shield className="w-4 h-4 text-muted-foreground shrink-0" />
              <p className="text-[11px] text-muted-foreground">I tuoi dati di pagamento sono criptati e protetti. Non conserviamo i dati della tua carta.</p>
            </div>
          </div>
        )}

        {/* History */}
        {tab === "history" && (
          <div className="space-y-2">
            {transactions.length === 0 ? (
              <div className="text-center py-12">
                <History className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nessuna transazione</p>
              </div>
            ) : (
              transactions.map(tx => (
                <div key={tx.id} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border/50">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center ${Number(tx.amount) >= 0 ? "bg-green-500/10" : "bg-primary/10"}`}>
                    {Number(tx.amount) >= 0 ? <ArrowDownLeft className="w-4 h-4 text-green-500" /> : <ArrowUpRight className="w-4 h-4 text-primary" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{tx.description || tx.type}</p>
                    <div className="flex items-center gap-2">
                      <p className="text-[11px] text-muted-foreground">{new Date(tx.created_at).toLocaleDateString("it-IT")}</p>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                        tx.status === "completed" ? "bg-green-500/10 text-green-500" : "bg-yellow-500/10 text-yellow-500"
                      }`}>{tx.status === "completed" ? "Completato" : "In attesa"}</span>
                    </div>
                  </div>
                  <span className={`text-sm font-bold ${Number(tx.amount) >= 0 ? "text-green-500" : ""}`}>
                    {Number(tx.amount) >= 0 ? "+" : ""}€{Math.abs(Number(tx.amount)).toFixed(2)}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Add Card Modal */}
      {showAddCard && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end">
          <div className="w-full rounded-t-3xl bg-card p-6 space-y-4 animate-slide-up">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-display font-bold">Aggiungi Carta</h3>
              <button onClick={() => setShowAddCard(false)} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>
            <input placeholder="Nome sulla carta" value={cardForm.name} onChange={e => setCardForm({ ...cardForm, name: e.target.value })}
              className="w-full px-4 py-3 rounded-xl bg-muted text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
            <input placeholder="Numero carta" value={cardForm.number} onChange={e => setCardForm({ ...cardForm, number: e.target.value })} maxLength={19}
              className="w-full px-4 py-3 rounded-xl bg-muted text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
            <div className="flex gap-3">
              <input placeholder="MM/AA" value={cardForm.expiry} onChange={e => setCardForm({ ...cardForm, expiry: e.target.value })} maxLength={5}
                className="flex-1 px-4 py-3 rounded-xl bg-muted text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
              <input placeholder="CVV" value={cardForm.cvv} onChange={e => setCardForm({ ...cardForm, cvv: e.target.value })} maxLength={4} type="password"
                className="flex-1 px-4 py-3 rounded-xl bg-muted text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
            </div>
            <button onClick={addCard} className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold">Salva Carta</button>
          </div>
        </div>
      )}

      {/* Add IBAN Modal */}
      {showAddIBAN && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end">
          <div className="w-full rounded-t-3xl bg-card p-6 space-y-4 animate-slide-up">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-display font-bold">Collega Conto Bancario</h3>
              <button onClick={() => setShowAddIBAN(false)} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/20">
              <p className="text-xs text-blue-500 font-medium flex items-center gap-2">
                <Shield className="w-3.5 h-3.5" /> I tuoi dati bancari sono protetti e criptati
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Intestatario conto</label>
              <input placeholder="Mario Rossi" value={ibanForm.holder} onChange={e => setIbanForm({ ...ibanForm, holder: e.target.value })}
                className="w-full px-4 py-3 rounded-xl bg-muted text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">IBAN</label>
              <input placeholder="IT60 X054 2811 1010 0000 0123 456" value={ibanForm.iban}
                onChange={e => setIbanForm({ ...ibanForm, iban: e.target.value.toUpperCase() })}
                className="w-full px-4 py-3 rounded-xl bg-muted text-sm font-mono tracking-wider focus:outline-none focus:ring-1 focus:ring-primary/30" />
              <p className="text-xs text-muted-foreground">Inserisci il tuo IBAN completo (es. IT60X0542811101000000123456)</p>
            </div>
            <button onClick={saveIBAN} className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold">
              {profile?.iban ? "Aggiorna IBAN" : "Collega Conto"}
            </button>
          </div>
        </div>
      )}

      {/* Withdraw Modal */}
      {showWithdraw && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end">
          <div className="w-full rounded-t-3xl bg-card p-6 space-y-4 animate-slide-up">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-display font-bold">Preleva</h3>
              <button onClick={() => setShowWithdraw(false)} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>
            {!WITHDRAWALS_LIVE ? (
              <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-2">
                <p className="text-sm font-semibold text-amber-600">Prelievi in arrivo 🚧</p>
                <p className="text-xs text-muted-foreground">
                  Stiamo attivando il sistema di pagamento verso conti bancari reali.
                  Il tuo saldo di {(profile?.qr_coins || 0).toLocaleString()} QR Coins resta al sicuro e sarà prelevabile appena il servizio sarà attivo.
                </p>
              </div>
            ) : profile?.iban ? (
              <>
                <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/20 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-500" />
                  <span className="text-xs text-muted-foreground">Invieremo su: <strong>IBAN •••• {profile.iban.slice(-4)}</strong></span>
                </div>
                <input type="number" placeholder="Importo (€)" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-muted text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
                <p className="text-[11px] text-muted-foreground">Saldo disponibile: <strong>{balance.toLocaleString()} QR Coins</strong></p>
                <button onClick={handleWithdraw} className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold">Conferma Prelievo</button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Devi collegare un conto bancario per poter prelevare.</p>
                <button onClick={() => { setShowWithdraw(false); setShowAddIBAN(true); }}
                  className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2">
                  <Building2 className="w-4 h-4" /> Collega Conto Bancario
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* QR Transfer Modal */}
      <QRTransferModal open={showQRTransfer} onClose={() => setShowQRTransfer(false)} onComplete={() => { loadTransactions(); refreshProfile(); }} />

      {/* Share App Modal */}
      <ShareAppModal open={showShareApp} onClose={() => setShowShareApp(false)} />
    </MobileLayout>
  );
}
