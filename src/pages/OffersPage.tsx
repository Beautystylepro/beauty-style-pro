import MobileLayout from "@/components/layout/MobileLayout";
import { ArrowLeft, Tag, Flame, Clock, Percent, Gift, Plus, ShoppingBag, Sparkles } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useVerificationGuard } from "@/hooks/useVerificationGuard";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import beauty1 from "@/assets/beauty-1.jpg";
import beauty2 from "@/assets/beauty-2.jpg";
import beauty3 from "@/assets/beauty-3.jpg";

const fallbackImages = [beauty1, beauty2, beauty3];

const typeLabels: Record<string, { label: string; icon: any; color: string }> = {
  discount: { label: "Sconto", icon: Percent, color: "bg-primary/10 text-primary" },
  flash_sale: { label: "Flash Sale", icon: Flame, color: "bg-orange-500/10 text-orange-500" },
  bundle: { label: "Bundle", icon: Gift, color: "bg-green-500/10 text-green-500" },
  seasonal: { label: "Stagionale", icon: Tag, color: "bg-blue-500/10 text-blue-500" },
};

export default function OffersPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { guardAction, isProOrBusiness } = useVerificationGuard();
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", original_price: "", offer_price: "", offer_type: "discount" });
  const [suggestingText, setSuggestingText] = useState(false);

  const suggestOfferText = async () => {
    if (!form.title.trim()) { toast.error("Scrivi prima il titolo dell'offerta"); return; }
    setSuggestingText(true);
    const { data, error } = await supabase.functions.invoke("generate-marketing-copy", {
      body: {
        goal: `Descrizione breve e invogliante per un'offerta beauty: "${form.title}"${form.original_price && form.offer_price ? `, da €${form.original_price} a €${form.offer_price}` : ""}. 2-3 frasi.`,
        existingText: form.description.trim() || undefined,
        channel: "email",
      },
    });
    setSuggestingText(false);
    if (error || data?.error) { toast.error(data?.error || "Suggerimento non riuscito"); return; }
    if (data?.body) setForm(f => ({ ...f, description: data.body.slice(0, 500) }));
  };

  useEffect(() => { fetchOffers(); }, []);

  const fetchOffers = async () => {
    const { data } = await supabase
      .from("special_offers")
      .select("*")
      .eq("active", true)
      .order("created_at", { ascending: false });
    setOffers(data || []);
    setLoading(false);
  };

  const handleCreate = async () => {
    if (guardAction("creare offerte")) return;
    const op = parseFloat(form.original_price);
    const ofp = parseFloat(form.offer_price);
    if (!form.title.trim() || isNaN(op) || isNaN(ofp) || ofp >= op) {
      toast.error("Compila correttamente tutti i campi");
      return;
    }
    const { error } = await supabase.from("special_offers").insert({
      seller_id: user!.id,
      title: form.title.trim().slice(0, 100),
      description: form.description.trim().slice(0, 500) || null,
      original_price: op,
      offer_price: ofp,
      offer_type: form.offer_type,
    });
    if (error) { toast.error("Errore nella creazione"); return; }
    toast.success("Offerta pubblicata! 🎉");
    setForm({ title: "", description: "", original_price: "", offer_price: "", offer_type: "discount" });
    setShowCreate(false);
    fetchOffers();
  };

  const getTimeLeft = (endDate: string | null) => {
    if (!endDate) return null;
    const diff = new Date(endDate).getTime() - Date.now();
    if (diff <= 0) return "Scaduta";
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(hours / 24);
    return days > 0 ? `${days}g rimanenti` : `${hours}h rimanenti`;
  };

  return (
    <MobileLayout>
      <header className="sticky top-0 z-40 glass px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)}><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="text-lg font-display font-bold flex-1">Offerte Speciali</h1>
        {isProOrBusiness && (
          <button onClick={() => { if (!guardAction("creare offerte")) setShowCreate(!showCreate); }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold">
            <Plus className="w-3.5 h-3.5" /> Crea
          </button>
        )}
      </header>

      <div className="p-4 space-y-4">
        {showCreate && (
          <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-3 fade-in">
            <h3 className="font-semibold text-sm">Nuova Offerta</h3>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Titolo offerta *" maxLength={100}
              className="w-full h-10 rounded-xl bg-background border border-border px-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
            <div className="relative">
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Descrizione..." rows={2} maxLength={500}
                className="w-full rounded-xl bg-background border border-border px-4 py-2 pr-10 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary/30" />
              <button onClick={suggestOfferText} disabled={suggestingText} title="Suggerisci con AI"
                className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center disabled:opacity-50">
                <Sparkles className={`w-3.5 h-3.5 text-primary ${suggestingText ? "animate-pulse" : ""}`} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input value={form.original_price} onChange={e => setForm(f => ({ ...f, original_price: e.target.value }))}
                placeholder="Prezzo originale €" type="number" step="0.01"
                className="h-10 rounded-xl bg-background border border-border px-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
              <input value={form.offer_price} onChange={e => setForm(f => ({ ...f, offer_price: e.target.value }))}
                placeholder="Prezzo scontato €" type="number" step="0.01"
                className="h-10 rounded-xl bg-background border border-border px-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
            </div>
            <select value={form.offer_type} onChange={e => setForm(f => ({ ...f, offer_type: e.target.value }))}
              className="w-full h-10 rounded-xl bg-background border border-border px-4 text-sm">
              <option value="discount">Sconto</option>
              <option value="flash_sale">Flash Sale</option>
              <option value="bundle">Bundle</option>
              <option value="seasonal">Stagionale</option>
            </select>
            <div className="flex gap-2">
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2 rounded-xl bg-muted text-sm font-semibold">Annulla</button>
              <button onClick={handleCreate} className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">Pubblica</button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-32 rounded-xl bg-card animate-pulse" />)}</div>
        ) : offers.length === 0 ? (
          <div className="text-center py-16">
            <Tag className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-semibold">Nessuna offerta disponibile</p>
            <p className="text-xs text-muted-foreground mt-1">Le offerte speciali appariranno qui</p>
          </div>
        ) : (
          <div className="space-y-3">
            {offers.map((offer, idx) => {
              const typeInfo = typeLabels[offer.offer_type] || typeLabels.discount;
              const Icon = typeInfo.icon;
              const timeLeft = getTimeLeft(offer.end_date);
              return (
                <div key={offer.id} className="rounded-2xl bg-card border border-border/50 overflow-hidden">
                  <div className="relative h-32">
                    <img src={offer.image_url || fallbackImages[idx % fallbackImages.length]} alt="" className="w-full h-full object-cover" />
                    <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold" style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}>
                      <Icon className="w-3 h-3" /> {typeInfo.label}
                    </div>
                    {offer.discount_percentage && (
                      <div className="absolute top-2 right-2 px-2 py-1 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                        -{offer.discount_percentage}%
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <h3 className="text-sm font-bold">{offer.title}</h3>
                    {offer.description && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{offer.description}</p>}
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-lg font-bold text-primary">€{Number(offer.offer_price).toFixed(2)}</span>
                      <span className="text-xs text-muted-foreground line-through">€{Number(offer.original_price).toFixed(2)}</span>
                    </div>
                    {timeLeft && (
                      <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" /> {timeLeft}
                      </div>
                    )}
                    <button onClick={() => {
                      if (!user) { navigate("/auth"); return; }
                      navigate(`/checkout?amount=${offer.offer_price}&desc=${encodeURIComponent(offer.title)}&type=product`);
                    }} className="w-full mt-2 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center gap-1">
                      <ShoppingBag className="w-3.5 h-3.5" /> Acquista Ora
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </MobileLayout>
  );
}
