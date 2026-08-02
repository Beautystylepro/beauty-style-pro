import MobileLayout from "@/components/layout/MobileLayout";
import { ArrowLeft, Gavel, Clock, TrendingUp, Plus, Users, Trophy } from "lucide-react";
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

export default function AuctionsPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { guardAction, isProOrBusiness } = useVerificationGuard();
  const [auctions, setAuctions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [bidAmount, setBidAmount] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ title: "", description: "", starting_price: "", buy_now_price: "", duration_hours: "48" });

  useEffect(() => { fetchAuctions(); }, []);

  const fetchAuctions = async () => {
    const { data } = await supabase
      .from("auctions")
      .select("*")
      .in("status", ["active"])
      .order("end_date", { ascending: true });
    setAuctions(data || []);
    setLoading(false);
  };

  const handleCreate = async () => {
    if (guardAction("creare aste")) return;
    const sp = parseFloat(form.starting_price);
    if (!form.title.trim() || isNaN(sp) || sp <= 0) {
      toast.error("Compila correttamente tutti i campi");
      return;
    }
    const endDate = new Date(Date.now() + parseInt(form.duration_hours) * 3600000).toISOString();
    const bnp = form.buy_now_price ? parseFloat(form.buy_now_price) : null;
    const { error } = await supabase.from("auctions").insert({
      seller_id: user!.id,
      title: form.title.trim().slice(0, 100),
      description: form.description.trim().slice(0, 500) || null,
      starting_price: sp,
      current_price: sp,
      buy_now_price: bnp,
      end_date: endDate,
    });
    if (error) { toast.error("Errore nella creazione"); return; }
    toast.success("Asta pubblicata! 🔨");
    setForm({ title: "", description: "", starting_price: "", buy_now_price: "", duration_hours: "48" });
    setShowCreate(false);
    fetchAuctions();
  };

  const placeBid = async (auction: any) => {
    if (!user) { navigate("/auth"); return; }
    const amount = parseFloat(bidAmount[auction.id] || "0");
    if (amount <= Number(auction.current_price)) {
      toast.error(`L'offerta deve essere superiore a €${Number(auction.current_price).toFixed(2)}`);
      return;
    }
    const { data, error } = await supabase.rpc("place_auction_bid", {
      _auction_id: auction.id,
      _amount: amount,
    });
    const result = data?.[0];
    if (error || !result?.success) {
      toast.error(result?.message || "Errore nell'offerta");
      fetchAuctions();
      return;
    }
    toast.success(`Offerta di €${amount.toFixed(2)} piazzata! 🎯`);
    setBidAmount(prev => ({ ...prev, [auction.id]: "" }));
    fetchAuctions();
  };

  const buyNow = async (auction: any) => {
    if (!user) { navigate("/auth"); return; }
    navigate(`/checkout?amount=${auction.buy_now_price}&desc=${encodeURIComponent(auction.title + " (Compralo Subito)")}&type=product`);
  };

  const getTimeLeft = (endDate: string) => {
    const diff = new Date(endDate).getTime() - Date.now();
    if (diff <= 0) return "Terminata";
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    if (h >= 24) return `${Math.floor(h / 24)}g ${h % 24}h`;
    return `${h}h ${m}m`;
  };

  return (
    <MobileLayout>
      <header className="sticky top-0 z-40 glass px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)}><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="text-lg font-display font-bold flex-1">Aste</h1>
        {isProOrBusiness && (
          <button onClick={() => { if (!guardAction("creare aste")) setShowCreate(!showCreate); }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold">
            <Plus className="w-3.5 h-3.5" /> Crea
          </button>
        )}
      </header>

      <div className="p-4 space-y-4">
        {showCreate && (
          <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-3 fade-in">
            <h3 className="font-semibold text-sm">Nuova Asta</h3>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Titolo *" maxLength={100}
              className="w-full h-10 rounded-xl bg-background border border-border px-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Descrizione..." rows={2} maxLength={500}
              className="w-full rounded-xl bg-background border border-border px-4 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary/30" />
            <div className="grid grid-cols-2 gap-2">
              <input value={form.starting_price} onChange={e => setForm(f => ({ ...f, starting_price: e.target.value }))}
                placeholder="Prezzo base €" type="number" step="0.01"
                className="h-10 rounded-xl bg-background border border-border px-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
              <input value={form.buy_now_price} onChange={e => setForm(f => ({ ...f, buy_now_price: e.target.value }))}
                placeholder="Compralo subito €" type="number" step="0.01"
                className="h-10 rounded-xl bg-background border border-border px-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
            </div>
            <select value={form.duration_hours} onChange={e => setForm(f => ({ ...f, duration_hours: e.target.value }))}
              className="w-full h-10 rounded-xl bg-background border border-border px-4 text-sm">
              <option value="24">24 ore</option>
              <option value="48">48 ore</option>
              <option value="72">3 giorni</option>
              <option value="168">7 giorni</option>
            </select>
            <div className="flex gap-2">
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2 rounded-xl bg-muted text-sm font-semibold">Annulla</button>
              <button onClick={handleCreate} className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">Pubblica</button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-40 rounded-xl bg-card animate-pulse" />)}</div>
        ) : auctions.length === 0 ? (
          <div className="text-center py-16">
            <Gavel className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-semibold">Nessuna asta attiva</p>
            <p className="text-xs text-muted-foreground mt-1">Le aste appariranno qui</p>
          </div>
        ) : (
          <div className="space-y-4">
            {auctions.map((auction, idx) => {
              const timeLeft = getTimeLeft(auction.end_date);
              const isEnding = new Date(auction.end_date).getTime() - Date.now() < 3600000;
              return (
                <div key={auction.id} className="rounded-2xl bg-card border border-border/50 overflow-hidden">
                  <div className="relative h-36">
                    <img src={auction.image_url || fallbackImages[idx % fallbackImages.length]} alt="" className="w-full h-full object-cover" />
                    <div className={`absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${isEnding ? "bg-red-500 text-white" : "bg-background/80 text-foreground"}`}>
                      <Clock className="w-3 h-3" /> {timeLeft}
                    </div>
                    <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full bg-background/80 text-xs font-semibold">
                      <Users className="w-3 h-3" /> {auction.bid_count || 0} offerte
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    <h3 className="text-sm font-bold">{auction.title}</h3>
                    {auction.description && <p className="text-[11px] text-muted-foreground line-clamp-2">{auction.description}</p>}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">Offerta attuale</p>
                        <p className="text-lg font-bold text-primary">€{Number(auction.current_price).toFixed(2)}</p>
                      </div>
                      {auction.buy_now_price && (
                        <button onClick={() => buyNow(auction)}
                          className="px-3 py-1.5 rounded-lg bg-accent/10 text-accent text-xs font-bold flex items-center gap-1">
                          <Trophy className="w-3 h-3" /> Compra ora €{Number(auction.buy_now_price).toFixed(2)}
                        </button>
                      )}
                    </div>
                    {timeLeft !== "Terminata" && (
                      <div className="flex gap-2">
                        <input
                          type="number" step="0.01"
                          value={bidAmount[auction.id] || ""}
                          onChange={e => setBidAmount(prev => ({ ...prev, [auction.id]: e.target.value }))}
                          placeholder={`Min €${(Number(auction.current_price) + 1).toFixed(2)}`}
                          className="flex-1 h-10 rounded-xl bg-background border border-border px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30"
                        />
                        <button onClick={() => placeBid(auction)}
                          className="px-4 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-bold flex items-center gap-1">
                          <TrendingUp className="w-4 h-4" /> Offri
                        </button>
                      </div>
                    )}
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
